import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { useAnimatedValue } from '@/hooks/useAnimatedValue';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { CueKey, playCue } from '@/lib/cueAudio';
import { stopSpeaking } from '@/lib/voice';
import { BreathPattern, PhaseKind } from '@/state/breathing';
import { colors, fonts } from '@/theme/tokens';

const SMALL = 0.62; // scale at full exhale
const BIG = 1.06; // scale at full inhale

const PHASE_CUE: Record<PhaseKind, CueKey> = {
  in: 'breathe-in',
  hold: 'hold',
  out: 'breathe-out',
};

/**
 * Paced breathing visual. The circle grows on the inhale, holds, and shrinks
 * on the exhale over the pattern's real timings. The current phase label and a
 * per-phase countdown are shown, and (when voiceOn) each phase is spoken by the
 * soothing voice. Changing pattern restarts the cycle; toggling voice does not.
 *
 * With Reduce Motion on, the circle stays still and brightens on the inhale
 * and dims on the exhale instead - same timing, same cue, no movement.
 */
export function BreathingGuide({ pattern, voiceOn }: { pattern: BreathPattern; voiceOn: boolean }) {
  const scale = useAnimatedValue(SMALL);
  const reduced = useReducedMotion();
  // One driver for both presentations: scale when motion is fine, opacity
  // when the user has asked for less of it.
  const motion = reduced
    ? { opacity: scale.interpolate({ inputRange: [SMALL, BIG], outputRange: [0.45, 1] }) }
    : { transform: [{ scale }] };
  const [label, setLabel] = useState(pattern.phases[0].label);
  const [remaining, setRemaining] = useState(pattern.phases[0].seconds);
  const voiceRef = useRef(voiceOn);
  useEffect(() => {
    voiceRef.current = voiceOn;
  }, [voiceOn]);

  useEffect(() => {
    let cancelled = false;
    let phaseTimer: ReturnType<typeof setTimeout>;
    let tick: ReturnType<typeof setInterval>;

    const runPhase = (i: number) => {
      if (cancelled) return;
      const phase = pattern.phases[i];
      setLabel(phase.label);
      setRemaining(phase.seconds);
      // Play the current phase's recorded cue (falls back to TTS on web).
      if (voiceRef.current) playCue(PHASE_CUE[phase.kind], phase.label);
      // accessibilityLiveRegion below is Android-only; VoiceOver needs an
      // explicit announcement. Skipped when the voice is on, which already
      // says the same words.
      else if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(phase.label);

      const target = phase.kind === 'in' ? BIG : phase.kind === 'out' ? SMALL : undefined;
      if (target !== undefined) {
        Animated.timing(scale, {
          toValue: target,
          duration: phase.seconds * 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }).start();
      }

      const startedAt = Date.now();
      clearInterval(tick);
      tick = setInterval(() => {
        const rem = Math.max(0, phase.seconds - Math.floor((Date.now() - startedAt) / 1000));
        setRemaining(rem);
      }, 250);

      phaseTimer = setTimeout(() => runPhase((i + 1) % pattern.phases.length), phase.seconds * 1000);
    };

    runPhase(0);
    return () => {
      cancelled = true;
      clearTimeout(phaseTimer);
      clearInterval(tick);
      stopSpeaking();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pattern]);

  return (
    <View style={styles.stage}>
      <Animated.View style={[styles.halo, motion]} importantForAccessibility="no-hide-descendants">
        <Svg width={210} height={210}>
          <Defs>
            <RadialGradient id="halo" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={colors.accent} stopOpacity={0.22} />
              <Stop offset="70%" stopColor={colors.accent} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={105} cy={105} r={105} fill="url(#halo)" />
        </Svg>
      </Animated.View>
      <Animated.View style={[styles.core, motion]}>
        <Text
          style={styles.count}
          maxFontSizeMultiplier={1.2}
          accessibilityElementsHidden
          importantForAccessibility="no"
        >
          {remaining}
        </Text>
      </Animated.View>
      {/* The phase is announced as it changes; the per-second count is not,
          or a screen reader would talk over the breathing. */}
      <Text
        style={styles.label}
        maxFontSizeMultiplier={1.3}
        // Silent while the voice says each phase, or TalkBack heard it twice.
        accessibilityLiveRegion={voiceOn ? 'none' : 'polite'}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { width: 240, height: 270, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute' },
  core: {
    position: 'absolute',
    top: 51,
    width: 116,
    height: 116,
    borderRadius: 58,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  count: {
    fontFamily: fonts.display.bold,
    fontSize: 34,
    color: colors.onAccent,
    fontVariant: ['tabular-nums'],
  },
  label: {
    position: 'absolute',
    bottom: 6,
    fontFamily: fonts.display.semibold,
    fontSize: 17,
    letterSpacing: 0.5,
    color: colors.textMuted,
  },
});
