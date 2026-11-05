import React, { useEffect } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { useAnimatedValue } from '@/hooks/useAnimatedValue';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import Svg, { Circle } from 'react-native-svg';
import { colors } from '@/theme/tokens';

const SIZE = 70;
const STROKE = 3;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;

/**
 * Interlude spinner: hairline ring with an ember top arc, 1s linear spin.
 * With Reduce Motion on it holds still - the words beside it carry the wait.
 */
export function Spinner({ label = 'Working' }: { label?: string }) {
  const spin = useAnimatedValue(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [spin, reduced]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={styles.wrap} accessible accessibilityRole="progressbar" accessibilityLabel={label}>
      <Animated.View style={{ transform: [{ rotate }] }}>
        <Svg width={SIZE} height={SIZE}>
          <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} stroke={colors.hairlineDim} strokeWidth={STROKE} fill="none" />
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            stroke={colors.accent}
            strokeWidth={STROKE}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${C * 0.25} ${C * 0.75}`}
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          />
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: SIZE, height: SIZE },
});
