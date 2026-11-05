import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useAnimatedValue } from '@/hooks/useAnimatedValue';
import { CueKey, playCue } from '@/lib/cueAudio';
import { stopSpeaking } from '@/lib/voice';
import { GROUNDING } from '@/state/breathing';
import { colors, fonts, spacing } from '@/theme/tokens';

/**
 * 5-4-3-2-1 grounding. Therapists stress this must be SLOW and deliberate
 * (2-5 min, "slow and specific beats fast and perfect") and paired with slow
 * breathing - so each step is gently auto-paced with a filling bar (the app
 * does the timing, like a guided breathing cue) while still letting you tap to
 * move on at your own speed. Each prompt is spoken by the soothing voice.
 */

// Deliberately unhurried: more time to name more things. ~60s total + settle.
const secondsFor = (count: number) => count * 2 + 6;

export function GroundingExercise({ voiceOn }: { voiceOn: boolean }) {
  const [step, setStep] = useState(0);
  const progress = useAnimatedValue(0);
  const [barWidth, setBarWidth] = useState(0);
  const done = step >= GROUNDING.length;
  const current = done ? null : GROUNDING[step];
  const voiceRef = useRef(voiceOn);
  useEffect(() => {
    voiceRef.current = voiceOn;
  }, [voiceOn]);

  useEffect(() => {
    if (!current) return;
    if (voiceRef.current) playCue(`ground-${current.sense}` as CueKey, current.prompt);
    // A step that advances on its own timer must be announced (VoiceOver and
    // TalkBack alike); the voice, when on, already says it.
    else AccessibilityInfo.announceForAccessibility(current.prompt);
    progress.setValue(0);
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: secondsFor(current.count) * 1000,
      easing: Easing.linear,
      useNativeDriver: false,
    });
    anim.start(({ finished }) => {
      if (finished) setStep((s) => s + 1);
    });
    return () => {
      anim.stop();
      stopSpeaking();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  if (done) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.doneBig} accessibilityRole="header">
          You're here.
        </Text>
        <Text style={styles.doneSub}>
          Back in the room, out of the urge. Notice it already feels a little smaller.
        </Text>
        <Pressable
          style={styles.again}
          onPress={() => setStep(0)}
          accessibilityRole="button"
          accessibilityLabel="Go again"
        >
          <Text style={styles.againLabel}>Go again</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <Pressable
      style={styles.wrap}
      onPress={() => setStep((s) => s + 1)}
      accessibilityRole="button"
      accessibilityLabel={`Step ${step + 1} of ${GROUNDING.length}. ${current!.prompt}`}
      accessibilityHint="Moves to the next step when you're ready"
    >
      <View style={styles.countCircle}>
        <Text style={styles.count} maxFontSizeMultiplier={1.2}>
          {current!.count}
        </Text>
      </View>
      <Text style={styles.prompt}>{current!.prompt}</Text>
      <Text style={styles.hint}>Breathe slow. Really notice each one - no rush.</Text>
      <View style={styles.track} onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}>
        <Animated.View
          style={[
            styles.fill,
            { width: progress.interpolate({ inputRange: [0, 1], outputRange: [0, barWidth] }) },
          ]}
        />
      </View>
      <View style={styles.dots}>
        {GROUNDING.map((_, i) => (
          <View key={i} style={[styles.dot, i <= step && styles.dotOn]} />
        ))}
      </View>
      <Text style={styles.tapHint}>Tap to move on when you're ready</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 18 },
  countCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 2,
    borderColor: colors.accent,
    backgroundColor: colors.surfaceWarm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  count: { fontFamily: fonts.display.black, fontSize: 44, color: colors.accent },
  prompt: {
    fontFamily: fonts.display.semibold,
    fontSize: 19,
    lineHeight: 19 * 1.35,
    color: colors.text,
    textAlign: 'center',
    marginTop: 22,
    paddingHorizontal: spacing.screenX,
  },
  hint: {
    fontFamily: fonts.body.regular,
    fontSize: 13,
    color: colors.textDim,
    textAlign: 'center',
    marginTop: 10,
  },
  track: {
    width: 200,
    height: 4,
    backgroundColor: colors.hairlineDim,
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 18,
  },
  fill: { height: '100%', backgroundColor: colors.accent, borderRadius: 2 },
  dots: { flexDirection: 'row', gap: 8, marginTop: 18 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.hairline },
  dotOn: { backgroundColor: colors.accent },
  tapHint: { fontFamily: fonts.body.regular, fontSize: 12.5, color: colors.textFaint, marginTop: 14 },
  doneBig: { fontFamily: fonts.display.extrabold, fontSize: 30, color: colors.text, marginTop: 10 },
  doneSub: {
    fontFamily: fonts.body.regular,
    fontSize: 14.5,
    lineHeight: 14.5 * 1.5,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 12,
    paddingHorizontal: spacing.screenX,
  },
  again: {
    marginTop: 20,
    borderWidth: 1.5,
    borderColor: colors.hairline,
    borderRadius: spacing.radius,
    paddingVertical: 12,
    paddingHorizontal: 26,
  },
  againLabel: { fontFamily: fonts.display.bold, fontSize: 14, color: colors.text },
});
