import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  BackHandler,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { EmberButton } from '@/components/EmberButton';
import { ChevronLeftIcon } from '@/components/icons';
import { OptionRow } from '@/components/OptionRow';
import { Screen } from '@/components/Screen';
import { useScreenReader } from '@/hooks/useScreenReader';
import { track } from '@/lib/analytics';
import { useAppState } from '@/state/AppState';
import { CYCLE_NOTE, HISTORY_ALWAYS_COME_BACK, QUESTIONS } from '@/state/quiz-data';
import { colors, fonts, tracking } from '@/theme/tokens';

const AUTO_ADVANCE_MS = 260;

/**
 * The 10-question diagnostic. One question per screen, single-select
 * auto-advances after a short selection-feedback beat, multi-select requires
 * Continue. Back chevron steps back within the quiz only.
 *
 * Android's system back does the same. The question index is component state,
 * so without this the Stack popped the whole quiz and dropped the user on
 * Welcome from question 7, to start again from question 1.
 */
export default function Quiz() {
  const router = useRouter();
  const { answers, setAnswer } = useAppState();
  const [qi, setQi] = useState(0);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  // With a screen reader on, a single answer waits for Continue too: moving
  // on 260ms after a double-tap destroyed the focused option before anything
  // was read, and a mis-tap could not be undone.
  const readerOn = useScreenReader();

  useEffect(() => () => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
  }, []);

  const q = QUESTIONS[qi];
  const value = answers[q.id];
  const selectedIdxs = Array.isArray(value) ? value : [];
  const continueEnabled = q.multi ? selectedIdxs.length > 0 : value != null;
  const autoAdvance = !q.multi && !readerOn;

  const advance = () => {
    track('funnel_question_answered', { question: q.id, index: qi + 1 });
    if (qi < QUESTIONS.length - 1) {
      setQi(qi + 1);
      // The next question starts at the top, at any text size, and is said
      // aloud: the old one, and the option that had focus, are gone.
      scrollRef.current?.scrollTo({ y: 0, animated: false });
      AccessibilityInfo.announceForAccessibility(
        `Question ${qi + 2} of ${QUESTIONS.length}. ${QUESTIONS[qi + 1].title}`,
      );
    } else router.push('/onboarding/interlude');
  };

  const back = () => {
    // A pending auto-advance would otherwise fire after this and move forward.
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    if (qi > 0) setQi(qi - 1);
    else router.back();
  };

  useFocusEffect(
    useCallback(() => {
      // Hardware back is Android's; on the web the call only logs an error.
      if (Platform.OS !== 'android') return;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (qi === 0) return false; // first question: leave the quiz normally
        if (advanceTimer.current) clearTimeout(advanceTimer.current);
        setQi(qi - 1);
        return true;
      });
      return () => sub.remove();
    }, [qi]),
  );

  const pick = (idx: number) => {
    if (q.multi) {
      const next = selectedIdxs.includes(idx)
        ? selectedIdxs.filter((i) => i !== idx)
        : [...selectedIdxs, idx];
      setAnswer(q.id, next);
    } else {
      setAnswer(q.id, idx);
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
      if (autoAdvance) advanceTimer.current = setTimeout(advance, AUTO_ADVANCE_MS);
    }
  };

  const showCycleNote = q.id === 'cost' && answers.history === HISTORY_ALWAYS_COME_BACK;

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Pressable
            onPress={back}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <ChevronLeftIcon color={colors.textMuted} />
          </Pressable>
          <View
            style={styles.track}
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel="Quiz progress"
            // As words: iOS computes a percentage that ignores `min`, so a
            // min of 1 read question 1 as 11% and question 10 as 111%.
            accessibilityValue={{ text: `Question ${qi + 1} of ${QUESTIONS.length}` }}
          >
            <View style={[styles.fill, { width: `${((qi + 1) / QUESTIONS.length) * 100}%` }]} />
          </View>
        </View>
        <Text style={styles.qLabel} accessibilityLabel={`Question ${qi + 1} of ${QUESTIONS.length}`}>
          QUESTION {qi + 1} OF {QUESTIONS.length}
        </Text>
      </View>

      <ScrollView ref={scrollRef} style={styles.body} contentContainerStyle={styles.bodyContent}>
        {showCycleNote && (
          <View style={styles.note}>
            <Text style={styles.noteText}>{CYCLE_NOTE}</Text>
          </View>
        )}
        <Text style={styles.title} accessibilityRole="header">
          {q.title}
        </Text>
        {q.multi && <Text style={styles.multiHint}>Select all that apply</Text>}
        {q.options.map((label, idx) => (
          <OptionRow
            key={label}
            label={label}
            selected={q.multi ? selectedIdxs.includes(idx) : value === idx}
            multi={!!q.multi}
            onPress={() => pick(idx)}
          />
        ))}
      </ScrollView>

      {!autoAdvance && (
        <View style={styles.footer}>
          <EmberButton label="Continue" disabled={!continueEnabled} onPress={advance} />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingTop: 22, paddingHorizontal: 26 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  track: {
    flex: 1,
    height: 6,
    backgroundColor: colors.hairlineDim,
    borderRadius: 4,
    overflow: 'hidden',
  },
  fill: { height: '100%', backgroundColor: colors.accent, borderRadius: 4 },
  qLabel: {
    fontFamily: fonts.body.semibold,
    fontSize: 12,
    letterSpacing: 12 * 0.14,
    color: colors.textFaint,
    marginTop: 12,
  },
  body: { flex: 1 },
  bodyContent: { paddingTop: 14, paddingHorizontal: 26, paddingBottom: 20 },
  note: {
    backgroundColor: colors.surfaceWarm,
    borderWidth: 1,
    borderColor: colors.surfaceWarmBorder,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 18,
  },
  noteText: {
    fontFamily: fonts.body.regular,
    fontSize: 13.5,
    lineHeight: 13.5 * 1.5,
    color: colors.notice,
  },
  title: {
    fontFamily: fonts.display.extrabold,
    fontSize: 25,
    lineHeight: 25 * 1.2,
    letterSpacing: tracking(25, -0.01),
    color: colors.text,
    marginBottom: 20,
  },
  multiHint: {
    fontFamily: fonts.body.regular,
    fontSize: 13,
    color: colors.textDim,
    marginTop: -12,
    marginBottom: 16,
  },
  footer: { paddingHorizontal: 26, paddingBottom: 12 },
});
