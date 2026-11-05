import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, fonts } from '@/theme/tokens';

/**
 * A selectable pill. `role` says how screen readers announce it: 'radio'
 * inside a one-answer group, 'checkbox' when several can be picked.
 * Selected is ember-tinted, the same language as the quiz options.
 */
export function Chip({
  label,
  selected,
  onPress,
  role = 'radio',
  accessibilityLabel,
  hint,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  role?: 'radio' | 'checkbox';
  accessibilityLabel?: string;
  hint?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, selected && styles.chipOn]}
      accessibilityRole={role}
      // aria-checked rather than accessibilityState: the same state on a
      // phone, and React Native Web drops accessibilityState entirely.
      aria-checked={selected}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={hint}
    >
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 15,
    minHeight: 44,
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: colors.surfaceWarm, borderColor: colors.accent },
  label: { fontFamily: fonts.body.medium, fontSize: 13.5, color: colors.text },
});
