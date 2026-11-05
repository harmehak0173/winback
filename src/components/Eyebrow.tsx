import React from 'react';
import { StyleSheet, Text, TextStyle } from 'react-native';
import { colors, fonts } from '@/theme/tokens';

/** Uppercase tracked label - "DAYS CLEAN", "MONEY WON BACK", etc. */
export function Eyebrow({
  children,
  size = 11.5,
  letterSpacingEm = 0.26,
  color = colors.textDim,
  style,
  maxFontSizeMultiplier,
  heading = false,
}: {
  children: string;
  size?: number;
  letterSpacingEm?: number;
  color?: string;
  style?: TextStyle;
  /** Cap for large-text settings, for labels that sit inside fixed shapes. */
  maxFontSizeMultiplier?: number;
  /**
   * A label that starts a section of a page: announced as a heading, so a
   * screen reader can jump section to section (the You tab has twelve).
   * Not for captions inside a card or a button.
   */
  heading?: boolean;
}) {
  return (
    <Text
      accessibilityRole={heading ? 'header' : undefined}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      style={[
        styles.base,
        { fontSize: size, letterSpacing: size * letterSpacingEm, color },
        style,
      ]}
    >
      {children.toUpperCase()}
    </Text>
  );
}

const styles = StyleSheet.create({
  base: { fontFamily: fonts.body.semibold },
});
