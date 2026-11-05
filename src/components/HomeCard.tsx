import React from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { colors, fonts, spacing } from '@/theme/tokens';

/**
 * One contextual card on Home: an eyebrow, one line that says what it is,
 * and an optional quiet sub-line. The whole card is the button.
 *
 * Every card on Home uses this, so no single one can shout louder than the
 * others; `done` quiets a card whose job for today is finished - with token
 * colours rather than opacity, which would drop the sub-line below AA.
 *
 * At large text sizes the title is never cut short: `titleLines` only clamps
 * at ordinary sizes, where the clamp keeps Home calm.
 */
export function HomeCard({
  eyebrow,
  title,
  sub,
  onPress,
  done = false,
  titleLines = 2,
  hint,
}: {
  eyebrow: string;
  title: string;
  sub?: string;
  onPress: () => void;
  done?: boolean;
  titleLines?: number;
  /** Screen-reader hint: where the tap goes. */
  hint?: string;
}) {
  const { fontScale } = useWindowDimensions();
  return (
    <Pressable
      style={({ pressed }) => [styles.card, done && styles.cardDone, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[eyebrow, title, sub].filter(Boolean).join('. ')}
      accessibilityHint={hint}
    >
      <View style={styles.text}>
        <Text style={[styles.eyebrow, done && styles.eyebrowDone]}>{eyebrow.toUpperCase()}</Text>
        <Text style={[styles.title, done && styles.titleDone]} numberOfLines={fontScale >= 1.5 ? undefined : titleLines}>
          {title}
        </Text>
        {!!sub && <Text style={styles.sub}>{sub}</Text>}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: spacing.cardGap,
    marginHorizontal: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: spacing.radius,
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
  cardDone: { borderColor: colors.hairlineDim, backgroundColor: colors.bg },
  pressed: { opacity: 0.85 },
  text: { gap: 3 },
  eyebrow: {
    fontFamily: fonts.body.semibold,
    fontSize: 10.5,
    letterSpacing: 10.5 * 0.18,
    color: colors.accent,
  },
  eyebrowDone: { color: colors.accentDim },
  title: { fontFamily: fonts.display.bold, fontSize: 15.5, lineHeight: 15.5 * 1.3, color: colors.text },
  titleDone: { color: colors.textMuted },
  sub: { fontFamily: fonts.body.regular, fontSize: 12, color: colors.textDim },
});
