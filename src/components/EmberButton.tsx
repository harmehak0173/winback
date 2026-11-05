import React from 'react';
import { Pressable, StyleSheet, Text, ViewStyle } from 'react-native';
import { colors, fonts, spacing } from '@/theme/tokens';

/**
 * Primary CTA - full-width ember fill, Archivo 700, 17px vertical padding.
 * `disabled` renders the greyed multi-select Continue state.
 */
export function EmberButton({
  label,
  onPress,
  disabled = false,
  style,
  accessibilityHint,
}: {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  style?: ViewStyle;
  accessibilityHint?: string;
}) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      aria-disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
        style,
      ]}
    >
      <Text style={[styles.label, disabled && styles.labelDisabled]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: '100%',
    backgroundColor: colors.accent,
    paddingVertical: 17,
    borderRadius: spacing.radius,
    alignItems: 'center',
  },
  disabled: { backgroundColor: colors.hairline },
  pressed: { opacity: 0.88 },
  label: {
    fontFamily: fonts.display.bold,
    fontSize: 17,
    color: colors.onAccent,
  },
  labelDisabled: { color: colors.textFaint },
});
