import React, { useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text } from 'react-native';
import { useAnimatedValue } from '@/hooks/useAnimatedValue';
import { colors, fonts, spacing } from '@/theme/tokens';

const HOLD_MS = 1300;
/** The button's vertical padding, shared with the label copy inside the fill. */
const PAD_Y = 18;

/**
 * "Hold to commit" - ember fill sweeps left→right over 1.3s while pressed;
 * releasing early resets. Completing the sweep fires onCommit once.
 *
 * A screen reader's double-tap is a press-in and press-out in one instant, so
 * it would start the fill and cancel it; the deliberate double-tap is the
 * screen-reader equivalent of the hold, so it commits directly. On Android
 * TalkBack's double-tap is the 'activate' action. On iOS the new architecture
 * no longer maps double-tap to 'activate' (it only lists it in the rotor), so
 * onAccessibilityTap commits there, for VoiceOver, Switch Control and Full
 * Keyboard Access alike.
 */
export function HoldToCommitButton({ onCommit }: { onCommit: () => void }) {
  const fill = useAnimatedValue(0);
  const committed = useRef(false);
  const [width, setWidth] = useState(0);

  const start = () => {
    if (committed.current) return;
    Animated.timing(fill, {
      toValue: 1,
      duration: HOLD_MS,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished && !committed.current) {
        committed.current = true;
        onCommit();
      }
    });
  };

  const commitNow = () => {
    if (committed.current) return;
    committed.current = true;
    fill.stopAnimation();
    fill.setValue(1);
    onCommit();
  };

  const cancel = () => {
    if (committed.current) return;
    fill.stopAnimation();
    Animated.timing(fill, { toValue: 0, duration: 120, useNativeDriver: false }).start();
  };

  return (
    <Pressable
      onPressIn={start}
      onPressOut={cancel}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={styles.button}
      accessible
      accessibilityRole="button"
      accessibilityLabel="Hold to commit"
      accessibilityHint="Commits to your quit date"
      accessibilityActions={[{ name: 'activate', label: 'Commit' }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'activate') commitNow();
      }}
      onAccessibilityTap={commitNow}
    >
      <Animated.View
        style={[
          styles.fill,
          {
            width: fill.interpolate({
              inputRange: [0, 1],
              outputRange: [0, width],
            }),
          },
        ]}
      >
        {/* The part of the label the fill has passed, in the colour that
            reads on ember: the light label on ember is 2.11:1, onAccent on
            ember 8.39:1. Clipped by the fill; screen readers have the label. */}
        <Text
          style={[styles.label, styles.labelOnFill, { width: Math.max(0, width - 3) }]}
          accessibilityElementsHidden
          importantForAccessibility="no"
        >
          Hold to commit
        </Text>
      </Animated.View>
      <Text style={styles.label}>Hold to commit</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: '100%',
    borderWidth: 1.5,
    borderColor: colors.accent,
    backgroundColor: colors.surface,
    paddingVertical: PAD_Y,
    borderRadius: spacing.radius,
    overflow: 'hidden',
    alignItems: 'center',
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.accent,
    overflow: 'hidden',
  },
  label: {
    fontFamily: fonts.display.bold,
    fontSize: 17,
    color: colors.text,
    // Centred line by line, so both copies wrap to the same place at large
    // text sizes.
    textAlign: 'center',
  },
  // Inside the fill, over the label: the border is 1.5pt a side, hence -3.
  labelOnFill: {
    position: 'absolute',
    top: PAD_Y,
    left: 0,
    color: colors.onAccent,
  },
});
