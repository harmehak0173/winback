import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CheckIcon } from './icons';
import { colors, fonts, spacing } from '@/theme/tokens';

/**
 * Quiz option row. Selected: ember-tinted surface, ember border, 22px ember
 * check circle on the right.
 *
 * Announced as a checkbox on multi-select questions and a radio button on
 * single-select ones, with its checked state - the check circle alone told a
 * screen-reader user nothing about what they had picked.
 */
export function OptionRow({
  label,
  selected,
  onPress,
  multi = false,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  /** Multi-select question: announce as a checkbox rather than a radio. */
  multi?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.row, selected && styles.rowSelected]}
      accessibilityRole={multi ? 'checkbox' : 'radio'}
      // aria-checked rather than accessibilityState: the same state on a
      // phone, and React Native Web drops accessibilityState entirely.
      aria-checked={selected}
      accessibilityLabel={label}
    >
      <Text style={styles.label}>{label}</Text>
      {selected && (
        <View style={styles.check}>
          <CheckIcon color={colors.onAccent} />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.hairline,
    borderRadius: spacing.radius,
    paddingVertical: 17,
    paddingHorizontal: 18,
    marginBottom: 12,
  },
  rowSelected: {
    backgroundColor: colors.surfaceWarm,
    borderColor: colors.accent,
  },
  label: {
    flex: 1,
    fontFamily: fonts.body.medium,
    fontSize: 16,
    color: colors.text,
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
