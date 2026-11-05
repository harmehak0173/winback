import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BreathingGuide } from '@/components/BreathingGuide';
import { EmberButton } from '@/components/EmberButton';
import { Eyebrow } from '@/components/Eyebrow';
import { XIcon } from '@/components/icons';
import { Screen } from '@/components/Screen';
import { GroundingExercise } from '@/components/GroundingExercise';
import { useNow } from '@/hooks/useNow';
import { preloadCues, releaseCues, stopCues } from '@/lib/cueAudio';
import { minSec } from '@/lib/format';
import { speakSoothing, stopSpeaking, warmUpVoice } from '@/lib/voice';
import { useAppState } from '@/state/AppState';
import { PATTERNS } from '@/state/breathing';
import { type Rep, repById, REPS } from '@/state/reps';
import { colors, fonts, spacing, tracking } from '@/theme/tokens';

/**
 * The daily rep: two minutes of practising a crisis skill while calm.
 *
 * The panic screen asks for breathing, grounding or a steady sentence at the
 * worst moment of someone's week; this is where those get practised on a
 * quiet one. It reuses the panic screen's own guide and grounding, and the
 * same recorded cues (or on-device speech) - no new audio.
 *
 * The count is cumulative and nothing else: "reps in the bank", never a
 * streak, and a day without one is simply not shown. Finishing a breathing
 * rep can make that pattern the panic screen's go-to.
 */

type Phase = 'ready' | 'running' | 'done';

/** Shared empty list, so a rep with no script lines keeps a stable value. */
const NO_LINES: string[] = [];

export default function RepScreen() {
  const { ready } = useAppState();
  // The rep is chosen once, on mount, from the day of the run and the go-to
  // pattern. Before state has loaded those are still defaults, and a cold
  // start from the morning reminder would lock in a different rep from the
  // one Home offered (or refuse one asked for by id).
  if (!ready) return <Screen>{null}</Screen>;
  return <RepSession />;
}

function RepSession() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const {
    todaysRep,
    repDoneToday,
    lifetime,
    currentStreakDays,
    favouritePattern,
    logRep,
    setFavouritePattern,
  } = useAppState();

  // Only reps offered at this point in the run: an imagery rep asked for by
  // id before day 14 falls back to today's.
  const eligible = REPS.filter((r) => r.minDay <= currentStreakDays);
  const requested = id ? repById(id) : undefined;
  const [repId, setRepId] = useState(() =>
    requested && requested.minDay <= currentStreakDays ? requested.id : todaysRep.id,
  );
  const rep: Rep = repById(repId) ?? todaysRep;
  const pattern = rep.patternId ? PATTERNS.find((p) => p.id === rep.patternId) : undefined;

  const [phase, setPhase] = useState<Phase>('ready');
  const [choosing, setChoosing] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [startedAt, setStartedAt] = useState(0);
  const [line, setLine] = useState(0);
  const now = useNow(phase === 'running' ? 1000 : 60_000);
  const elapsed = phase === 'running' ? Math.max(0, now - startedAt) : 0;
  const remaining = Math.max(0, rep.seconds * 1000 - elapsed);
  const lines = rep.lines ?? NO_LINES;
  const lineMs = lines.length ? (rep.seconds * 1000) / lines.length : 0;

  // Load the voice clips during the first render, as the panic screen does:
  // the guide is a child, and its first cue fires before a mount effect here.
  useState(() => {
    preloadCues();
    return true;
  });

  useEffect(() => {
    preloadCues();
    void warmUpVoice();
    return () => {
      stopSpeaking();
      releaseCues();
    };
  }, []);

  // Read by the line effect below, so muting mid-line never repeats a line.
  const voiceRef = useRef(voiceOn);
  useEffect(() => {
    voiceRef.current = voiceOn;
    if (!voiceOn) {
      stopCues();
      stopSpeaking();
    }
  }, [voiceOn]);

  // Script reps: one line at a time, about twenty seconds each, spoken when
  // the voice is on. "Next" moves on sooner.
  useEffect(() => {
    if (phase !== 'running' || rep.kind !== 'script' || !lines.length) return;
    if (voiceRef.current) void speakSoothing(lines[line]);
    if (line >= lines.length - 1) return;
    const t = setTimeout(() => setLine((l) => Math.min(l + 1, lines.length - 1)), lineMs);
    return () => clearTimeout(t);
  }, [phase, line, lines, lineMs, rep.kind]);

  const start = () => {
    setLine(0);
    setStartedAt(Date.now());
    setChoosing(false);
    setPhase('running');
  };

  const finish = () => {
    if (phase !== 'running') return;
    stopCues();
    stopSpeaking();
    logRep(rep.patternId ?? null, rep.id);
    setPhase('done');
  };

  // A breathing rep ends itself when its two minutes are up. The timer calls
  // the latest finish through a ref, so a re-render does not restart it.
  const finishRef = useRef(finish);
  useEffect(() => {
    finishRef.current = finish;
  });
  useEffect(() => {
    if (phase !== 'running' || rep.kind !== 'breathe') return;
    const wait = Math.max(0, rep.seconds * 1000 - (Date.now() - startedAt));
    const t = setTimeout(() => finishRef.current(), wait);
    return () => clearTimeout(t);
  }, [phase, rep.kind, rep.seconds, startedAt]);

  const close = () => {
    stopSpeaking();
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  const choose = (r: Rep) => {
    setRepId(r.id);
    setChoosing(false);
  };

  const banked = lifetime.repsDone;
  const isGoTo = !!rep.patternId && favouritePattern === rep.patternId;

  return (
    <Screen>
      <View style={styles.closeRow}>
        <Pressable
          style={styles.closeButton}
          onPress={close}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={phase === 'running' ? 'Stop and close' : 'Close'}
        >
          <XIcon color={colors.textMuted} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Eyebrow>{rep.id === todaysRep.id ? "Today's rep" : 'Daily rep'}</Eyebrow>
        <Text style={styles.title} accessibilityRole="header">
          {rep.title}
        </Text>
        <Text style={styles.skill}>{rep.skill}</Text>

        {phase === 'ready' && (
          <>
            {!!rep.note && (
              <View style={styles.noteBox}>
                <Text style={styles.noteText}>{rep.note}</Text>
              </View>
            )}
            <Text style={styles.meta}>
              About {Math.round(rep.seconds / 60)} minutes. {banked} rep{banked === 1 ? '' : 's'} in
              the bank.
              {repDoneToday ? " Today's is done - another one is always fine." : ''}
            </Text>
            <View style={styles.footer}>
              <EmberButton label="Start" onPress={start} />
              <Pressable
                onPress={() => setChoosing((c) => !c)}
                hitSlop={8}
                accessibilityRole="button"
                aria-expanded={choosing}
              >
                <Text style={styles.link}>{choosing ? 'Keep this one' : 'Pick a different rep'}</Text>
              </Pressable>
            </View>
            {choosing && (
              <View style={styles.list} accessibilityRole="radiogroup">
                {eligible.map((r) => (
                  <Pressable
                    key={r.id}
                    style={[styles.listItem, r.id === rep.id && styles.listItemOn]}
                    onPress={() => choose(r)}
                    accessibilityRole="radio"
                    aria-checked={r.id === rep.id}
                    accessibilityLabel={`${r.title}. ${r.skill}`}
                  >
                    <Text style={[styles.listTitle, r.id === rep.id && styles.listTitleOn]}>
                      {r.title}
                    </Text>
                    <Text style={styles.listSkill}>{r.skill}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </>
        )}

        {phase === 'running' && (
          <>
            {rep.kind === 'breathe' && pattern && (
              <View style={styles.guide}>
                <BreathingGuide pattern={pattern} voiceOn={voiceOn} />
              </View>
            )}
            {rep.kind === 'ground' && <GroundingExercise voiceOn={voiceOn} />}
            {rep.kind === 'script' && lines.length > 0 && (
              <View style={styles.scriptBox}>
                <Text style={styles.scriptStep}>
                  {line + 1} of {lines.length}
                </Text>
                <Text style={styles.scriptLine} accessibilityLiveRegion="polite">
                  {lines[line]}
                </Text>
                {line < lines.length - 1 && (
                  <Pressable
                    onPress={() => setLine((l) => Math.min(l + 1, lines.length - 1))}
                    hitSlop={10}
                    accessibilityRole="button"
                  >
                    <Text style={styles.link}>Next</Text>
                  </Pressable>
                )}
              </View>
            )}
            <View style={styles.metaRow}>
              <Text style={styles.timer}>
                {remaining > 0 ? `${minSec(remaining)} left` : 'Two minutes in'}
              </Text>
              {/* A button named by what it does, so the name spoken is the words
                  on screen (Voice Control users say what they see). */}
              <Pressable onPress={() => setVoiceOn((v) => !v)} hitSlop={8} accessibilityRole="button">
                <Text style={styles.voiceToggle}>{voiceOn ? 'Mute voice' : 'Unmute voice'}</Text>
              </Pressable>
            </View>
            <View style={styles.footer}>
              <EmberButton label="Done - bank it" onPress={finish} />
            </View>
          </>
        )}

        {phase === 'done' && (
          <>
            <View style={styles.doneBox} accessibilityLiveRegion="polite">
              <Text style={styles.doneTitle}>Banked.</Text>
              <Text style={styles.doneText}>
                {banked} rep{banked === 1 ? '' : 's'} in the bank. Practised calm is the kind that
                shows up when you need it.
              </Text>
            </View>
            {rep.kind === 'breathe' &&
              !!rep.patternId &&
              (isGoTo ? (
                <Text style={styles.meta}>This is your go-to. The panic button opens on it.</Text>
              ) : (
                <Pressable
                  style={styles.outline}
                  onPress={() => setFavouritePattern(rep.patternId!)}
                  accessibilityRole="button"
                  accessibilityHint="The panic button will open on this breathing pattern"
                >
                  <Text style={styles.outlineLabel}>Make this my go-to</Text>
                </Pressable>
              ))}
            <View style={styles.footer}>
              <EmberButton label="Close" onPress={close} />
            </View>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  closeRow: { alignItems: 'flex-end', paddingHorizontal: spacing.screenX, paddingTop: 10 },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { paddingHorizontal: spacing.screenX, paddingTop: 12, paddingBottom: 32 },
  title: {
    fontFamily: fonts.display.extrabold,
    fontSize: 27,
    lineHeight: 27 * 1.2,
    letterSpacing: tracking(27),
    color: colors.text,
    marginTop: 8,
  },
  skill: {
    fontFamily: fonts.body.regular,
    fontSize: 14.5,
    lineHeight: 14.5 * 1.55,
    color: colors.textMuted,
    marginTop: 8,
  },
  noteBox: {
    backgroundColor: colors.surfaceWarm,
    borderWidth: 1,
    borderColor: colors.surfaceWarmBorder,
    borderRadius: 14,
    padding: 14,
    marginTop: 18,
  },
  noteText: { fontFamily: fonts.body.regular, fontSize: 13.5, lineHeight: 13.5 * 1.5, color: colors.notice },
  meta: {
    fontFamily: fonts.body.regular,
    fontSize: 13,
    lineHeight: 13 * 1.5,
    color: colors.textDim,
    marginTop: 18,
  },
  footer: { marginTop: 24, gap: 4 },
  link: {
    fontFamily: fonts.body.regular,
    fontSize: 14,
    color: colors.textMuted,
    textDecorationLine: 'underline',
    textAlign: 'center',
    marginTop: 14,
  },
  list: { marginTop: 14, gap: 8 },
  listItem: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  listItemOn: { borderColor: colors.accent },
  listTitle: { fontFamily: fonts.display.bold, fontSize: 14.5, color: colors.text },
  listTitleOn: { color: colors.accent },
  listSkill: { fontFamily: fonts.body.regular, fontSize: 12.5, color: colors.textDim, marginTop: 2 },
  guide: { alignItems: 'center', marginTop: 16 },
  scriptBox: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 18,
    padding: 20,
    marginTop: 22,
    minHeight: 190,
  },
  scriptStep: { fontFamily: fonts.body.semibold, fontSize: 11.5, color: colors.textDim },
  scriptLine: {
    fontFamily: fonts.display.semibold,
    fontSize: 20,
    lineHeight: 20 * 1.4,
    color: colors.text,
    marginTop: 12,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 4,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    marginTop: 14,
  },
  timer: {
    fontFamily: fonts.display.bold,
    fontSize: 15,
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  voiceToggle: {
    fontFamily: fonts.body.regular,
    fontSize: 12.5,
    color: colors.textFaint,
    textDecorationLine: 'underline',
  },
  doneBox: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 18,
    padding: 18,
    marginTop: 22,
  },
  doneTitle: { fontFamily: fonts.display.extrabold, fontSize: 22, color: colors.text },
  doneText: {
    fontFamily: fonts.body.regular,
    fontSize: 14,
    lineHeight: 14 * 1.5,
    color: colors.textMuted,
    marginTop: 6,
  },
  outline: {
    borderWidth: 1.5,
    borderColor: colors.accent,
    borderRadius: spacing.radius,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  outlineLabel: { fontFamily: fonts.display.bold, fontSize: 15, color: colors.accent },
});
