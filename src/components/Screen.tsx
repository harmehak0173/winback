import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LockCover, useLockCover } from '@/components/LockGate';
import { colors } from '@/theme/tokens';

/** Breathing room kept between the last element and the safe-area edge. */
const MIN_BOTTOM_GAP = 12;

/**
 * Full-height near-black screen with safe-area padding.
 *
 * A caller's `paddingBottom` is combined with the bottom inset, never allowed
 * to replace it. Several onboarding screens set 30-34 for their CTA spacing,
 * and when that simply overrode the inset, the Continue buttons sat under the
 * Android navigation bar (edge-to-edge is mandatory now) and inside the iPhone
 * home-indicator zone. The result is the caller's spacing where there is no
 * inset, and the inset plus a small gap where there is one. With no caller
 * value, the bottom padding is the inset (at least 16).
 *
 * Also draws the app-lock cover. On iOS, modal screens (panic, slip, sign-in)
 * are presented above the root view where LockGate draws its own cover, so
 * each screen carries one too. It renders nothing when the app is unlocked.
 *
 * `onEscape` answers VoiceOver's two-finger escape gesture on a screen that
 * is presented like a modal, with the same handler as its Close button. It
 * is ignored while the app-lock cover is up, so nothing closes behind it.
 */
export function Screen({
  children,
  style,
  edges = ['top', 'bottom'],
  onEscape,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  edges?: ('top' | 'bottom')[];
  onEscape?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { covered } = useLockCover();
  const callerBottom = StyleSheet.flatten(style)?.paddingBottom;
  const hasCallerBottom = typeof callerBottom === 'number';
  let bottom = hasCallerBottom ? callerBottom : 0;
  if (edges.includes('bottom')) {
    bottom = hasCallerBottom
      ? Math.max(callerBottom, insets.bottom > 0 ? insets.bottom + MIN_BOTTOM_GAP : 0)
      : Math.max(insets.bottom, 16);
  }
  return (
    <View
      style={[
        styles.root,
        style,
        {
          paddingTop: edges.includes('top') ? insets.top : 0,
          paddingBottom: bottom,
        },
      ]}
      onAccessibilityEscape={onEscape && !covered ? onEscape : undefined}
    >
      {children}
      <LockCover />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
});
