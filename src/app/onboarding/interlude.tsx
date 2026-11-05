import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { EmberButton } from '@/components/EmberButton';
import { Screen } from '@/components/Screen';
import { Spinner } from '@/components/Spinner';
import { useScreenReader } from '@/hooks/useScreenReader';
import { track } from '@/lib/analytics';
import { syncQuizAnswers } from '@/lib/supabase';
import { useAppState } from '@/state/AppState';
import { INTERLUDE_LINES, QUESTIONS } from '@/state/quiz-data';
import { colors, fonts } from '@/theme/tokens';

const LINE_MS = 1050;
const TOTAL_MS = 3300;

/** "Building your profile" - 3.3s auto-advancing into the cost reveal. */
export default function Interlude() {
  const router = useRouter();
  const { answers } = useAppState();
  const [line, setLine] = useState(0);

  useEffect(() => {
    // Quiz is complete - persist raw answers now (commit re-syncs with profile).
    // `secrecy` stays on the device: filtered here and again inside
    // syncQuizAnswers, so neither this call site nor a future one can leak it.
    void syncQuizAnswers(
      QUESTIONS.filter((q) => q.id !== 'secrecy' && answers[q.id] != null).map((q) => {
        const v = answers[q.id]!;
        const idxs = Array.isArray(v) ? v : [v];
        return { question_id: q.id, answer: idxs.map((i) => q.options[i]) };
      }),
    );
    track('funnel_interlude');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // With a screen reader on it waits for Continue: a timed screen that
  // replaces itself mid-sentence is not one that can be read.
  const readerOn = useScreenReader();
  useEffect(() => {
    const cycle = setInterval(
      () => setLine((l) => Math.min(INTERLUDE_LINES.length - 1, l + 1)),
      LINE_MS,
    );
    const done = readerOn ? null : setTimeout(() => router.replace('/onboarding/reveal-1'), TOTAL_MS);
    return () => {
      clearInterval(cycle);
      if (done) clearTimeout(done);
    };
  }, [router, readerOn]);

  return (
    <Screen style={styles.screen}>
      <Spinner label="Building your profile" />
      <Text style={styles.text}>{INTERLUDE_LINES[line]}</Text>
      {readerOn && (
        <View style={styles.continue}>
          <EmberButton label="Continue" onPress={() => router.replace('/onboarding/reveal-1')} />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { alignItems: 'center', justifyContent: 'center', padding: 40 },
  text: {
    fontFamily: fonts.display.bold,
    fontSize: 19,
    lineHeight: 19 * 1.4,
    textAlign: 'center',
    color: colors.text,
    marginTop: 32,
  },
  continue: { alignSelf: 'stretch', marginTop: 32 },
});
