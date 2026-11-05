import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  BackHandler,
  Platform,
  AppState as RNAppState,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { HelplineName } from '@/components/HelplineRow';
import { PhoneIcon } from '@/components/icons';
import { isAuthenticating, isLockEnabled, requestUnlock, subscribeLock } from '@/lib/applock';
import {
  deviceDirectoryLine,
  deviceHelplines,
  helplineHint,
  openHelpline,
} from '@/lib/helplines';
import { colors, fonts, spacing } from '@/theme/tokens';

type LockState = {
  /** True while the app must be hidden: the lock is on and not yet passed. */
  covered: boolean;
  /** True only while the preference is still being read at launch. */
  checking: boolean;
  /**
   * The cover is up but there is nothing to unlock: the preference is still
   * loading, or an unlocked app is only shielded from the app switcher. The
   * cover then shows the wordmark alone, with no Unlock button.
   */
  plain: boolean;
  unlock: () => void;
};

/**
 * Android has no 'inactive': anything drawn over the app as its own activity -
 * the Play purchase sheet, the share chooser, the notification-permission
 * dialog, a browser tab for managing the subscription - pauses it, and React
 * Native reports that as 'background'. Re-locking on every one of those asked
 * for a fingerprint after each purchase and each share. So on Android a
 * return within this window counts as never having left. The cover still
 * goes up at once, so the app switcher never shows the app's content.
 */
const ANDROID_GRACE_MS = 30_000;

const LockContext = createContext<LockState>({
  covered: false,
  checking: false,
  plain: false,
  unlock: () => {},
});

/** Whether the app lock is currently hiding the app. Safe outside LockGate. */
export function useLockCover(): LockState {
  return useContext(LockContext);
}

/**
 * Holds the app behind a biometric/passcode prompt when the user has turned
 * the lock on. Locks again after a real trip to the background, so handing
 * someone your unlocked phone does not hand them your history.
 *
 * The app is never unmounted while locked. An opaque cover is drawn over it
 * instead, so someone who taps a helpline on the panic screen (which sends
 * the app to the background) comes back to the panic screen, timer and all,
 * rather than to a freshly mounted Home. Native modals (panic, slip, sign-in)
 * are presented above this view on iOS, so Screen draws the same cover inside
 * every screen too - see LockCover.
 *
 * Only a real 'background' transition re-locks, and only a return from one
 * prompts. On iOS the unlock sheet itself, Control Center, a call banner and
 * the purchase sheet all go to 'inactive' and back; prompting on every
 * 'active' turned each unlock into the trigger for the next one. Android
 * reports those overlays as 'background', so it gets a short grace window
 * instead (see ANDROID_GRACE_MS).
 *
 * 'inactive' never locks, but it does shield: iOS snapshots the app for the
 * app switcher as it leaves, and holds it in 'inactive' while the switcher is
 * open, so without a cover then the card showed the streak, the money and
 * whatever screen was open - to exactly the person the lock exists to hide
 * it from. The shield is the plain cover (no Unlock, no prompt) and drops on
 * the next 'active'. The Face ID sheet is excluded, so unlocking never
 * shields itself.
 *
 * The locked screen always offers the region's helpline as well as Unlock -
 * nobody should ever be shut out of help by a sensor or a lock bug.
 */
export function LockGate({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [locked, setLocked] = useState(false);
  // Up while iOS may be taking the app-switcher snapshot (see above).
  const [shielded, setShielded] = useState(false);
  // Set by a real background trip; consumed by the next 'active'.
  const promptOnReturn = useRef(false);
  const backgroundAt = useRef(0);
  // Mirrors `locked` for the listener. The grace window only ever applies to
  // an app that was open when it left - never to one still waiting to unlock.
  const lockedRef = useRef(false);
  const graceEligible = useRef(false);
  useEffect(() => {
    lockedRef.current = locked;
  }, [locked]);

  const attempt = useCallback(async () => {
    const ok = await requestUnlock();
    // A cancelled or failed prompt leaves things exactly as they were: the
    // cover stays up and Unlock is one tap away. It never re-locks an app
    // that was already open.
    if (ok) setLocked(false);
  }, []);

  useEffect(() => {
    let alive = true;
    void isLockEnabled().then((on) => {
      if (!alive) return;
      setEnabled(on);
      if (on) {
        setLocked(true);
        void attempt();
      }
    });
    return () => {
      alive = false;
    };
  }, [attempt]);

  // The You tab's toggle applies at once. Turning the lock on does not lock
  // straight away - the user has just authenticated to turn it on.
  useEffect(
    () =>
      subscribeLock((on) => {
        setEnabled(on);
        if (!on) {
          setLocked(false);
          setShielded(false);
          promptOnReturn.current = false;
        }
      }),
    [],
  );

  useEffect(() => {
    if (!enabled) return;
    const sub = RNAppState.addEventListener('change', (s) => {
      if (s === 'background') {
        // The Android 9-10 passcode screen is its own activity and sends the
        // app to the background mid-prompt. That is not the user leaving.
        if (isAuthenticating()) return;
        backgroundAt.current = Date.now();
        graceEligible.current = !lockedRef.current;
        setLocked(true);
        promptOnReturn.current = true;
      } else if (s === 'inactive') {
        // iOS only. Cover, never lock or prompt: see the note above.
        if (!isAuthenticating()) setShielded(true);
      } else if (s === 'active') {
        setShielded(false);
        if (!promptOnReturn.current || isAuthenticating()) return;
        promptOnReturn.current = false;
        if (
          Platform.OS === 'android' &&
          graceEligible.current &&
          Date.now() - backgroundAt.current < ANDROID_GRACE_MS
        ) {
          setLocked(false);
          return;
        }
        void attempt();
      }
    });
    return () => sub.remove();
  }, [enabled, attempt]);

  // While the preference is still being read we must not show the app (that
  // would flash the content a lock exists to hide), so the cover is up for
  // everyone for that moment - branded, with the buttons only once we know a
  // lock is actually on.
  const checking = enabled === null;
  const shieldOnly = !!enabled && shielded && !locked;
  const covered = checking || locked || shieldOnly;
  const plain = checking || shieldOnly;

  // The cover blocks touches, but Android's back button would still reach the
  // navigator underneath: closing panic, stepping the quiz back or leaving a
  // screen while the user cannot see what changed. Swallow it while covered.
  useEffect(() => {
    // Hardware back is Android's; on the web the call only logs an error.
    if (!covered || Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [covered]);

  return (
    <LockContext.Provider value={{ covered, checking, plain, unlock: () => void attempt() }}>
      <View
        style={styles.root}
        pointerEvents={covered ? 'none' : 'auto'}
        accessibilityElementsHidden={covered}
        importantForAccessibility={covered ? 'no-hide-descendants' : 'auto'}
      >
        {children}
      </View>
      {covered && <LockCover />}
    </LockContext.Provider>
  );
}

/**
 * The locked screen, drawn over whatever is underneath. Renders nothing when
 * the app is not locked, so any screen can include it unconditionally.
 */
export function LockCover() {
  const { covered, plain, unlock } = useLockCover();
  if (!covered) return null;
  // A device outside the verified regions gets the worldwide directory, as
  // everywhere else in the app - not the first US number on the list.
  const directory = deviceDirectoryLine();
  const line = directory ?? deviceHelplines()[0];
  const mode = directory ? undefined : 'call';
  return (
    <View style={[StyleSheet.absoluteFill, styles.screen]} accessibilityViewIsModal>
      <Text style={styles.wordmark} accessibilityRole="header">
        Winback
      </Text>
      {!plain && (
        <>
          <Text style={styles.body}>Winback is locked.</Text>
          <Pressable
            style={styles.button}
            onPress={unlock}
            accessibilityRole="button"
            accessibilityLabel="Unlock Winback"
          >
            <Text style={styles.buttonLabel}>Unlock</Text>
          </Pressable>
          {line && (
            <Pressable
              style={styles.help}
              onPress={() => void openHelpline(line, mode)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`${directory ? 'Find a helpline' : 'Call a helpline'}: ${line.name}`}
              accessibilityHint={helplineHint(line, mode)}
            >
              <PhoneIcon size={16} color={colors.accent} />
              <View>
                <Text style={styles.helpLabel}>{directory ? 'Find a helpline' : 'Call a helpline'}</Text>
                <HelplineName line={line} style={styles.helpSub} />
              </View>
            </Pressable>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  screen: {
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.screenX,
    zIndex: 1000,
    elevation: 1000,
  },
  wordmark: { fontFamily: fonts.display.extrabold, fontSize: 22, color: colors.text },
  body: { fontFamily: fonts.body.regular, fontSize: 14, color: colors.textMuted, marginTop: 10 },
  button: {
    marginTop: 22,
    borderWidth: 1.5,
    borderColor: colors.accent,
    borderRadius: spacing.radius,
    paddingVertical: 13,
    paddingHorizontal: 30,
  },
  buttonLabel: { fontFamily: fonts.display.bold, fontSize: 15, color: colors.accent },
  help: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 28,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  helpLabel: { fontFamily: fonts.display.semibold, fontSize: 14, color: colors.text },
  helpSub: { fontFamily: fonts.body.regular, fontSize: 12, color: colors.textDim, marginTop: 2 },
});
