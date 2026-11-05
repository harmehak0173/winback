import {
  Archivo_500Medium,
  Archivo_600SemiBold,
  Archivo_700Bold,
  Archivo_800ExtraBold,
  Archivo_900Black,
} from '@expo-google-fonts/archivo';
import {
  HankenGrotesk_400Regular,
  HankenGrotesk_500Medium,
  HankenGrotesk_600SemiBold,
} from '@expo-google-fonts/hanken-grotesk';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import {
  hasConsented,
  loadAnalyticsPreference,
  onConsentGiven,
  whenConsented,
} from '@/lib/analytics';
import { reportProductionConfig } from '@/lib/env';
import { initNotificationRouting } from '@/lib/notificationRouting';
import { identifyPurchases, initPurchases } from '@/lib/purchases';
import { setScheduleProvider } from '@/lib/schedule/ScheduleProvider';
import { TheSportsDbProvider } from '@/lib/schedule/TheSportsDbProvider';
import { ensureSession } from '@/lib/supabase';
import { AppErrorBoundary, reportAppError, reportFatalError } from '@/components/AppErrorBoundary';
import { LockGate } from '@/components/LockGate';
import { NotificationRouter } from '@/components/NotificationRouter';
import { AppStateProvider } from '@/state/AppState';
import { colors } from '@/theme/tokens';

// Log (never throw on) configuration gaps - a bad env var must not blank-screen
// the app. The premium guarantees are enforced in lib/purchases.ts instead.
reportProductionConfig();

// Game-day mode data source; swap for a paid provider before scale.
setScheduleProvider(new TheSportsDbProvider());

// The "Share usage data" setting and Welcome consent, read before any screen
// can fire an event. Events fired meanwhile are held, not sent.
void loadAnalyticsPreference();

// Errors that never reach a React error boundary (event handlers, timers,
// promise callbacks run by RN) go through the global handler. Report the
// error's class only, first party, then hand off to the default handler so
// behaviour is otherwise unchanged. Native builds only: the web build does
// define ErrorUtils, and Metro passes it a swallowed "Requiring unknown
// module" while resolving the lazily split RevenueCat chunk at each launch,
// which filed a false fatal app_error on every web visit.
type GlobalErrorHandler = (error: unknown, isFatal?: boolean) => void;
const errorUtils = (
  globalThis as {
    ErrorUtils?: {
      getGlobalHandler(): GlobalErrorHandler;
      setGlobalHandler(handler: GlobalErrorHandler): void;
    };
    __winbackErrorHandler?: boolean;
  }
);
if (Platform.OS !== 'web' && errorUtils.ErrorUtils && !errorUtils.__winbackErrorHandler) {
  errorUtils.__winbackErrorHandler = true;
  const previous = errorUtils.ErrorUtils.getGlobalHandler();
  errorUtils.ErrorUtils.setGlobalHandler((error, isFatal) => {
    if (!isFatal) {
      reportAppError(error, 'global', false);
      previous(error, isFatal);
      return;
    }
    // A fatal error becomes a native crash inside the default handler, which
    // killed the process before the async report could leave. Write it to the
    // outbox first (capped well under a second), then crash as before.
    let handed = false;
    const handOff = () => {
      if (handed) return;
      handed = true;
      previous(error, isFatal);
    };
    reportFatalError(error, 'global').then(handOff, handOff);
  });
}

/**
 * expo-router renders this instead of a crashed segment. Exported by name -
 * the router looks for exactly `ErrorBoundary`.
 */
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  return <AppErrorBoundary error={error} retry={retry} />;
}

// The app must always cold-start at the index gate (which routes committed
// users to Home and everyone else to onboarding) - never at a declared child
// screen like panic. `anchor` is the current key, `initialRouteName` the
// pre-SDK-53 one; unknown keys are ignored, so set both.
export const unstable_settings = {
  anchor: 'index',
  initialRouteName: 'index',
};

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Archivo_500Medium,
    Archivo_600SemiBold,
    Archivo_700Bold,
    Archivo_800ExtraBold,
    Archivo_900Black,
    HankenGrotesk_400Regular,
    HankenGrotesk_500Medium,
    HankenGrotesk_600SemiBold,
  });

  // A font that fails to download must not strand the user on the splash
  // screen forever - render with system fallbacks instead.
  const fontsSettled = fontsLoaded || !!fontError;

  useEffect(() => {
    if (fontsSettled) SplashScreen.hideAsync();
  }, [fontsSettled]);

  // Start listening for reminder taps straight away, before fonts or state:
  // a cold start from a notification has to catch the response the OS hands
  // over at launch. Nothing leaves the phone, so this does not wait for
  // consent. The routing itself waits for state (NotificationRouter below).
  useEffect(() => {
    initNotificationRouting();
  }, []);

  useEffect(() => {
    // Alias the store customer onto the account id, so subscriptions survive
    // the later email upgrade. Only once the user has agreed on Welcome: the
    // anonymous account is created by ensureSession, and nothing is created
    // before consent. Retried on each foreground (an offline first launch),
    // and again whenever consent is given anew: after "Erase on this device"
    // the next person agrees in the same process, and their new account must
    // be the store customer before they reach the paywall, not only after the
    // next trip to the background.
    let aliasedAs: string | null = null;
    const alias = async () => {
      if (!hasConsented()) return;
      const userId = await ensureSession();
      // Marked done only once the store has it, so a failure is tried again
      // on the next foreground rather than never.
      if (userId && userId !== aliasedAs && (await identifyPurchases(userId))) {
        aliasedAs = userId;
      }
    };
    void (async () => {
      // Configuring RevenueCat contacts it, so not before the user has agreed
      // on Welcome - nothing leaves the phone before that. It still does not
      // wait on any network call of ours: consent is a local read, so for a
      // returning user this runs at once, and the paywall (which comes after
      // the commit) never finds purchases unconfigured.
      await whenConsented();
      await initPurchases();
      await alias();
    })();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void alias();
    });
    const offConsent = onConsentGiven(() => void alias());
    return () => {
      sub.remove();
      offConsent();
    };
  }, []);

  if (!fontsSettled) return null;

  return (
    <LockGate>
      <AppStateProvider>
        <StatusBar style="light" />
        {/* Opens the screen a tapped reminder names, once state is ready.
            The lock overlay no longer unmounts this tree, so a tap made
            while locked lands underneath it and is there after unlocking. */}
        <NotificationRouter />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bg },
            animation: 'fade',
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="(tabs)" />
          {/* `dangerouslySingular`: a second tap (or a reminder) while one is
              already open reuses it instead of stacking another. Two panic
              screens meant two voice guides at once, and closing one left the
              other. `legal` is left out: its documents differ only by param. */}
          <Stack.Screen name="panic" dangerouslySingular options={{ presentation: 'fullScreenModal' }} />
          <Stack.Screen name="legal" options={{ presentation: 'modal' }} />
          <Stack.Screen name="signin" dangerouslySingular options={{ presentation: 'modal' }} />
          <Stack.Screen name="daily" dangerouslySingular options={{ presentation: 'modal' }} />
          {/* Full screen, not a sheet: a relapse is not a settings action. */}
          <Stack.Screen name="slip" dangerouslySingular options={{ presentation: 'fullScreenModal' }} />
          {/* One per game: a second game's close-out is its own screen. */}
          <Stack.Screen
            name="closeout"
            dangerouslySingular={(name, params) => `${name}:${String(params.game ?? '')}`}
            options={{ presentation: 'modal' }}
          />
          <Stack.Screen name="plan" dangerouslySingular options={{ presentation: 'modal' }} />
          <Stack.Screen name="recap" dangerouslySingular options={{ presentation: 'modal' }} />
          <Stack.Screen name="goal" dangerouslySingular options={{ presentation: 'modal' }} />
          <Stack.Screen name="rep" dangerouslySingular options={{ presentation: 'modal' }} />
          {/* A month of Premium on us: a sheet over the paywall or You. */}
          <Stack.Screen name="on-us" dangerouslySingular options={{ presentation: 'modal' }} />
          {/* Dark and full screen: a bedtime ritual, not a sheet over Home. */}
          <Stack.Screen name="lights-out" dangerouslySingular options={{ presentation: 'fullScreenModal' }} />
          {/* Pushed pages with a back gesture, like any other screen. */}
          <Stack.Screen
            name="cut-lines"
            dangerouslySingular
            options={{ presentation: 'card', animation: 'default' }}
          />
          <Stack.Screen
            name="comeback"
            dangerouslySingular
            options={{ presentation: 'card', animation: 'default' }}
          />
          <Stack.Screen
            name="reminders-intro"
            dangerouslySingular
            options={{ presentation: 'card', animation: 'default' }}
          />
        </Stack>
      </AppStateProvider>
    </LockGate>
  );
}
