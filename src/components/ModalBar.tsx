import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronLeftIcon } from '@/components/icons';
import { track } from '@/lib/analytics';
import { colors, fonts, spacing } from '@/theme/tokens';

/**
 * Leave a screen that may have been opened cold: from a notification, the
 * Android widget or a deep link there is nothing underneath it to go back to,
 * and router.back() would do nothing. Home is the safe landing.
 */
export function useLeave(): () => void {
  const router = useRouter();
  return () => (router.canGoBack() ? router.back() : router.replace('/(tabs)'));
}

/**
 * Open a playbook play on the Insights tab, expanded. From a sheet above the
 * tabs this steps back to the tabs first, the same way the daily read always
 * has, rather than stacking a second tab navigator on top of the first.
 *
 * Tracked with where it was opened from, never which play: plays map almost
 * one-to-one onto triggers, and several callers pick the play from the
 * person's own trigger log (the recap's top trigger, today's pinned plan).
 */
export function useOpenPlay(): (playId: string, from: string) => void {
  const router = useRouter();
  return (playId, from) => {
    track('play_opened', { from });
    if (router.canGoBack()) router.back();
    router.push({ pathname: '/(tabs)/insights', params: { play: playId } });
  };
}

/** Open the partner fields in You, stepping back to the tabs first like a play. */
export function useAddPerson(): () => void {
  const router = useRouter();
  return () => {
    if (router.canGoBack()) router.back();
    router.push({ pathname: '/(tabs)/you', params: { section: 'corner' } });
  };
}

/**
 * The top bar of a sheet (Close, right) or a pushed screen (Back, left).
 * Matches the legal sheet's text button, with a 44pt target either way.
 */
export function ModalBar({
  onClose,
  kind = 'close',
}: {
  onClose: () => void;
  kind?: 'close' | 'back';
}) {
  return (
    <View style={[styles.bar, kind === 'back' && styles.barBack]}>
      <Pressable
        onPress={onClose}
        hitSlop={12}
        style={styles.button}
        accessibilityRole="button"
        accessibilityLabel={kind === 'back' ? 'Back' : 'Close'}
      >
        {kind === 'back' ? (
          <ChevronLeftIcon color={colors.textMuted} />
        ) : (
          <Text style={styles.close}>Close</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { paddingHorizontal: spacing.screenX, paddingTop: 8, alignItems: 'flex-end' },
  barBack: { alignItems: 'flex-start', paddingHorizontal: spacing.screenX - 8 },
  button: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center' },
  close: { fontFamily: fonts.display.bold, fontSize: 15, color: colors.accent },
});
