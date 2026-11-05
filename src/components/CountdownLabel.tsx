import React from 'react';
import { StyleSheet, Text, TextStyle } from 'react-native';
import type { NextMilestone } from '@/state/AppState';
import { colors, fonts } from '@/theme/tokens';

/** "Two weeks in 2 days", "One week tomorrow". Null before commit. */
export function countdownText(next: NextMilestone | null): string | null {
  if (!next) return null;
  if (next.inDays <= 1) return `${next.title} tomorrow`;
  return `${next.title} in ${next.inDays} days`;
}

/**
 * The countdown to the next milestone (hook 3). Descriptive, never a warning:
 * it says what is coming, not what could be lost.
 */
export function CountdownLabel({ next, style }: { next: NextMilestone | null; style?: TextStyle }) {
  const text = countdownText(next);
  if (!text) return null;
  return <Text style={[styles.label, style]}>{text}</Text>;
}

const styles = StyleSheet.create({
  label: { fontFamily: fonts.body.regular, fontSize: 12.5, color: colors.textDim },
});
