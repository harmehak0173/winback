import * as Haptics from 'expo-haptics';
import { Redirect } from 'expo-router';
import React, { useState } from 'react';
import { AccessibilityInfo, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CheckIcon, MessageIcon } from '@/components/icons';
import { Eyebrow } from '@/components/Eyebrow';
import { ModalBar, useAddPerson, useLeave, useOpenPlay } from '@/components/ModalBar';
import { BankBlockNote, SelfExclusionGuide } from '@/components/RegionGuide';
import { Screen } from '@/components/Screen';
import { smsPartner, type Partner } from '@/lib/partner';
import { useAppState } from '@/state/AppState';
import { CUT_LINES, CUT_LINES_AS_OF, type CutLine } from '@/state/cutLines';
import { PLAYBOOK } from '@/state/playbook';
import { colors, fonts, spacing, tracking } from '@/theme/tokens';

type Status = 'done' | 'skip' | null;

/**
 * Cut the lines (hook 6): thirteen short tasks, each shutting a channel the
 * betting companies use to reach you. Stimulus control, not a points game -
 * the only number is how many lines are cut, and Skip is always an equal
 * choice. Self-exclusion, a bank block and the partner lock are big steps;
 * nobody is pushed into them.
 *
 * Opens on the next open task. Anything marked can be undone.
 */
export default function CutLinesScreen() {
  const leave = useLeave();
  const openPlay = useOpenPlay();
  const addPerson = useAddPerson();
  const { ready, quitDate, cutLinesDone, cutLinesSkipped, setLineCut, nextCutLine, partner } = useAppState();
  const [openId, setOpenId] = useState<string | null>(null);

  if (!ready) return <Screen edges={['top']}>{null}</Screen>;
  if (!quitDate) return <Redirect href="/" />;

  const statusOf = (id: string): Status =>
    cutLinesDone.includes(id) ? 'done' : cutLinesSkipped.includes(id) ? 'skip' : null;
  // With nothing chosen, the next open task is the one shown open.
  const expanded = openId ?? nextCutLine?.id ?? null;

  const mark = (line: CutLine, status: Status) => {
    if (status === 'done') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setLineCut(line.id, status);
    AccessibilityInfo.announceForAccessibility(
      status === 'done' ? 'Line cut.' : status === 'skip' ? 'Skipped.' : 'Undone.',
    );
    // Marked: fold it and let the next open task come up.
    if (status) setOpenId(null);
  };

  return (
    <Screen edges={['top']}>
      <ModalBar onClose={leave} kind="back" />
      <ScrollView contentContainerStyle={styles.content}>
        <Eyebrow>Cut the lines</Eyebrow>
        <Text style={styles.headline} accessibilityRole="header">
          Shut the doors they use to reach you.
        </Text>
        <Text style={styles.body}>
          One a day is plenty. Most take about a minute, and every one is skippable.
        </Text>
        <Text style={styles.progress} accessibilityLiveRegion="polite">
          Lines cut: {cutLinesDone.length} of {CUT_LINES.length}
        </Text>

        {CUT_LINES.map((line) => {
          const status = statusOf(line.id);
          const isOpen = expanded === line.id;
          return (
            <View key={line.id} style={[styles.card, status === 'done' && styles.cardDone]}>
              <Pressable
                style={styles.cardHead}
                onPress={() => setOpenId(isOpen ? '' : line.id)}
                accessibilityRole="button"
                aria-expanded={isOpen}
                accessibilityLabel={`${line.title}${status === 'done' ? ', done' : status === 'skip' ? ', skipped' : ''}`}
              >
                <View style={[styles.tick, status === 'done' && styles.tickDone]}>
                  {status === 'done' && <CheckIcon size={12} color={colors.onAccent} />}
                </View>
                <Text style={[styles.cardTitle, status != null && styles.cardTitleMarked]}>{line.title}</Text>
                {status === 'skip' && <Text style={styles.skipped}>Skipped</Text>}
              </Pressable>
              {isOpen && (
                <LineBody
                  line={line}
                  status={status}
                  partner={partner}
                  onMark={(s) => mark(line, s)}
                  onPlay={openPlay}
                  onAddPerson={addPerson}
                />
              )}
            </View>
          );
        })}

        <Text style={styles.asOf}>{CUT_LINES_AS_OF}</Text>
      </ScrollView>
    </Screen>
  );
}

function LineBody({
  line,
  status,
  partner,
  onMark,
  onPlay,
  onAddPerson,
}: {
  line: CutLine;
  status: Status;
  partner: Partner | null;
  onMark: (s: Status) => void;
  onPlay: (playId: string, from: string) => void;
  onAddPerson: () => void;
}) {
  const platformSteps = Platform.OS === 'ios' ? line.ios : Platform.OS === 'android' ? line.android : undefined;
  const steps = [...(line.steps ?? []), ...(platformSteps ?? [])];
  // Web and anything else get both lists, labelled.
  const bothLists = Platform.OS !== 'ios' && Platform.OS !== 'android';
  const play = line.playId ? PLAYBOOK.find((p) => p.id === line.playId) : undefined;
  const big = !!line.big;
  const partnerText = line.partnerText;

  return (
    <View style={styles.cardBody}>
      <Text style={styles.why}>{line.why}</Text>
      {steps.map((s, i) => (
        <View key={i} style={styles.stepRow}>
          <Text style={styles.stepNum}>{i + 1}.</Text>
          <Text style={styles.stepText}>{s}</Text>
        </View>
      ))}
      {bothLists &&
        (['ios', 'android'] as const).map((os) =>
          line[os]?.length ? (
            <View key={os}>
              <Text style={styles.osLabel}>{os === 'ios' ? 'On iPhone' : 'On Android'}</Text>
              {line[os]!.map((s, i) => (
                <Text key={i} style={styles.step}>
                  {s}
                </Text>
              ))}
            </View>
          ) : null,
        )}
      {line.regional === 'exclusion' && <SelfExclusionGuide />}
      {line.regional === 'bank' && <BankBlockNote />}
      {!!partnerText &&
        (partner ? (
          <Pressable
            style={styles.textButton}
            onPress={() => void smsPartner(partner, partnerText)}
            accessibilityRole="button"
            accessibilityLabel={`Text ${partner.name}`}
            accessibilityHint="Opens a text you can edit before sending"
          >
            <MessageIcon size={16} color={colors.accent} />
            <Text style={styles.textButtonLabel}>Text {partner.name}</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={onAddPerson}
            style={styles.linkHit}
            accessibilityRole="button"
            accessibilityHint="Opens the partner fields in You"
          >
            <Text style={styles.link}>No one saved yet? Add your person in You</Text>
          </Pressable>
        ))}
      {!!play && (
        <Pressable
          onPress={() => onPlay(play.id, 'cut_lines')}
          hitSlop={6}
          style={styles.playHit}
          accessibilityRole="link"
        >
          <Text style={styles.playLink}>Goes with: {play.title}</Text>
        </Pressable>
      )}

      {status == null ? (
        // Skip is always a fine answer; for the big steps it looks exactly as good as Done.
        <View style={styles.actions}>
          <Pressable
            style={[styles.action, !big && styles.actionDone]}
            onPress={() => onMark('done')}
            accessibilityRole="button"
          >
            <Text style={[styles.actionLabel, !big && styles.actionLabelDone]}>Done</Text>
          </Pressable>
          <Pressable style={styles.action} onPress={() => onMark('skip')} accessibilityRole="button">
            <Text style={styles.actionLabel}>Skip for now</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable onPress={() => onMark(null)} hitSlop={8} style={styles.undoHit} accessibilityRole="button">
          <Text style={styles.undo}>{status === 'done' ? 'Undo: not done yet' : 'Undo skip'}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.screenX, paddingTop: 4, paddingBottom: 40 },
  headline: {
    fontFamily: fonts.display.extrabold,
    fontSize: 27,
    lineHeight: 27 * 1.2,
    letterSpacing: tracking(27),
    color: colors.text,
    marginTop: 10,
  },
  body: {
    fontFamily: fonts.body.regular,
    fontSize: 15,
    lineHeight: 15 * 1.55,
    color: colors.textMuted,
    marginTop: 12,
  },
  progress: { fontFamily: fonts.display.bold, fontSize: 15, color: colors.accent, marginTop: 14, marginBottom: 16 },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: spacing.radius,
    marginBottom: 10,
  },
  cardDone: { borderColor: colors.surfaceWarmBorder },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, minHeight: 52 },
  tick: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tickDone: { backgroundColor: colors.accent, borderColor: colors.accent },
  cardTitle: { flex: 1, fontFamily: fonts.display.bold, fontSize: 15, color: colors.text },
  cardTitleMarked: { color: colors.textMuted },
  skipped: { fontFamily: fonts.body.medium, fontSize: 12, color: colors.textDim },
  cardBody: { paddingHorizontal: 16, paddingBottom: 16 },
  why: { fontFamily: fonts.body.regular, fontSize: 14, lineHeight: 14 * 1.5, color: colors.textMuted },
  stepRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  stepNum: { fontFamily: fonts.display.bold, fontSize: 14, color: colors.accent, minWidth: 18 },
  stepText: { flex: 1, fontFamily: fonts.body.regular, fontSize: 14, lineHeight: 14 * 1.5, color: colors.text },
  step: { fontFamily: fonts.body.regular, fontSize: 14, lineHeight: 14 * 1.5, color: colors.text, marginTop: 4 },
  osLabel: { fontFamily: fonts.body.semibold, fontSize: 12, color: colors.textDim, marginTop: 12 },
  textButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: colors.accent,
    borderRadius: spacing.radius,
    paddingVertical: 13,
    marginTop: 14,
  },
  textButtonLabel: { fontFamily: fonts.display.bold, fontSize: 15, color: colors.accent },
  linkHit: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', marginTop: 4 },
  link: { fontFamily: fonts.body.regular, fontSize: 13.5, color: colors.textMuted, textDecorationLine: 'underline' },
  playHit: { minHeight: 44, justifyContent: 'center', marginTop: 4 },
  playLink: { fontFamily: fonts.display.bold, fontSize: 13.5, color: colors.accent },
  actions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  action: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.hairline,
    borderRadius: spacing.radius,
    paddingVertical: 13,
    alignItems: 'center',
  },
  actionDone: { borderColor: colors.accent },
  actionLabel: { fontFamily: fonts.display.bold, fontSize: 15, color: colors.text },
  actionLabelDone: { color: colors.accent },
  undoHit: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', marginTop: 4 },
  undo: { fontFamily: fonts.body.regular, fontSize: 13.5, color: colors.textMuted, textDecorationLine: 'underline' },
  asOf: { fontFamily: fonts.body.regular, fontSize: 12, color: colors.textFaint, marginTop: 10 },
});
