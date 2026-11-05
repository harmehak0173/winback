import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Eyebrow } from './Eyebrow';
import { colors, fonts } from '@/theme/tokens';

/** The full-size ring. Short phones pass a smaller `size`; everything scales with it. */
export const RING_SIZE = 236;
const R_RATIO = 110 / 236;
const STROKE = 8;

/**
 * Home streak ring: ember arc showing progress toward the first 3-day
 * milestone, day count and live HH:MM:SS centered inside.
 *
 * The text lives in a fixed 236pt circle, so large-text settings are capped
 * here (body copy elsewhere scales freely): an 88pt numeral at Android's 2x
 * font scale is wider than the ring. For screen readers the ring is one
 * element with one sentence, rather than three fragments and a clock that
 * changes every second.
 */
export function StreakRing({
  progress,
  days,
  hms,
  size = RING_SIZE,
}: {
  /** 0..1 toward the current milestone. */
  progress: number;
  days: number;
  hms: string;
  /** Diameter in points. Defaults to the full 236. */
  size?: number;
}) {
  const clamped = Math.min(1, Math.max(0, progress));
  const SIZE = size;
  const R = size * R_RATIO;
  const CIRCUMFERENCE = 2 * Math.PI * R;
  const scale = size / RING_SIZE;
  return (
    <View
      style={{ width: SIZE, height: SIZE }}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${days} ${days === 1 ? 'day' : 'days'} clean`}
    >
      <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={StyleSheet.absoluteFill}>
        <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} stroke={colors.hairlineDim} strokeWidth={STROKE} fill="none" />
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          stroke={colors.accent}
          strokeWidth={STROKE}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - clamped)}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        />
      </Svg>
      <View style={styles.center}>
        <Eyebrow size={11} letterSpacingEm={0.32} maxFontSizeMultiplier={1.4}>
          Days clean
        </Eyebrow>
        <Text
          style={[styles.days, scale !== 1 && { fontSize: 88 * scale, lineHeight: 88 * scale * 0.95 }]}
          maxFontSizeMultiplier={1.1}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {days}
        </Text>
        <Text style={styles.hms} maxFontSizeMultiplier={1.3}>
          {hms}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  days: {
    fontFamily: fonts.display.extrabold,
    fontSize: 88,
    lineHeight: 88 * 0.95,
    color: colors.text,
    fontVariant: ['tabular-nums'],
    marginTop: 4,
    marginBottom: 2,
  },
  hms: {
    fontFamily: fonts.display.semibold,
    fontSize: 18,
    letterSpacing: 18 * 0.14,
    color: colors.accent,
    fontVariant: ['tabular-nums'],
  },
});
