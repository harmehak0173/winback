import * as Haptics from 'expo-haptics';
import { getLocales } from 'expo-localization';
import { Redirect } from 'expo-router';
import React, { useState } from 'react';
import {
  AccessibilityInfo,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { formatDay } from '@/components/CloseMark';
import { EmberButton } from '@/components/EmberButton';
import { Eyebrow } from '@/components/Eyebrow';
import { ModalBar, useLeave, useOpenPlay } from '@/components/ModalBar';
import { Screen } from '@/components/Screen';
import { localDayKey } from '@/lib/day';
import { formatDollars } from '@/lib/format';
import { type Goal, useAppState } from '@/state/AppState';
import { colors, fonts, spacing, tracking } from '@/theme/tokens';

/** Most goals Premium keeps (AppState caps at the same number). */
const MAX_GOALS = 5;

/** The phone's decimal separator ("." or ","), which the decimal-pad shows. */
function decimalSeparator(): string {
  try {
    const sep = getLocales()[0]?.decimalSeparator;
    return sep === ',' ? ',' : '.';
  } catch {
    return '.';
  }
}

/**
 * "1,200", "$1200.50", "12,50" or "1.200,50" -> 1200 / 1200.5 / 12.5 / 1200.5;
 * anything else -> null. The decimal-pad shows the locale's separator, so in
 * most of Europe "12,50" is twelve fifty - stripping the comma logged 1,250.
 * The last "," or "." is the decimal point when one or two digits follow it,
 * or when it is the phone's own decimal separator and appears only once;
 * every other separator is grouping.
 */
function parseDollars(text: string): number | null {
  const s = text.replace(/[^\d.,]/g, '');
  if (!/\d/.test(s)) return null;
  const last = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','));
  let whole = s;
  let frac = '';
  if (last >= 0) {
    const sep = s[last];
    const after = s.slice(last + 1);
    const isDecimal =
      /^\d{1,2}$/.test(after) ||
      (after.length > 0 && sep === decimalSeparator() && s.indexOf(sep) === last);
    if (isDecimal) {
      whole = s.slice(0, last);
      frac = after;
    }
  }
  const n = Number(`${whole.replace(/[.,]/g, '') || '0'}.${frac.replace(/[.,]/g, '') || '0'}`);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * The goal jar (hook 9): a name for where the money is going, an optional
 * target, and a log of real transfers.
 *
 * Two numbers, kept apart on purpose. The jar fills from the ESTIMATE of what
 * would have been bet - never a balance, and labelled so. "I moved it" logs
 * money actually moved, shown on its own line and never added to the
 * estimate. Nothing here is a schedule: no target date, no "behind".
 *
 * Copy says "kept", never "bankroll" or "winnings" - money that feels like a
 * stake is the licensing trap ("I'm up, one bet is fine"), which is what the
 * chase link at the bottom is for. Free keeps one goal; Premium keeps more.
 * All of it stays on this phone.
 */
export default function GoalScreen() {
  const leave = useLeave();
  const openPlay = useOpenPlay();
  const {
    ready,
    quitDate,
    goals,
    goalProgress,
    isPremium,
    setGoal,
    removeGoal,
    logMoved,
    moved,
    suggestedGoalName,
  } = useAppState();
  const visible = isPremium ? goals : goals.slice(0, 1);
  // Which goal the form edits: an id, 'new', or null for the first one.
  const [editing, setEditing] = useState<string | null>(null);
  const [movedText, setMovedText] = useState('');

  if (!ready) return <Screen edges={['top']}>{null}</Screen>;
  if (!quitDate) return <Redirect href="/" />;

  const current = editing === 'new' ? null : (visible.find((g) => g.id === editing) ?? visible[0] ?? null);
  const canAdd = isPremium ? visible.length < MAX_GOALS : visible.length === 0;
  const recentMoves = [...moved].reverse().slice(0, 3);

  const logIt = () => {
    const amount = parseDollars(movedText);
    if (amount == null) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    logMoved(amount);
    setMovedText('');
    AccessibilityInfo.announceForAccessibility('Logged.');
  };

  return (
    <Screen edges={['top']}>
      <ModalBar onClose={leave} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? undefined : 'padding'}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          <Eyebrow>Goal jar</Eyebrow>
          <Text style={styles.headline} accessibilityRole="header">
            Give the money a job.
          </Text>
          <Text style={styles.body}>
            The figure on Home is an estimate of what you would have bet. Naming where it goes makes it
            yours. It stays on this phone.
          </Text>

          {isPremium && visible.length > 0 && (
            <View style={styles.list} accessibilityRole="radiogroup" accessibilityLabel="Your goals">
              {goalProgress.goals.map((it) => {
                const on = it.goal.id === current?.id;
                const pct = it.fraction != null ? `${Math.floor(it.fraction * 100)}%` : 'No target';
                return (
                  <Pressable
                    key={it.goal.id}
                    onPress={() => setEditing(it.goal.id)}
                    style={[styles.goalRow, on && styles.goalRowOn]}
                    accessibilityRole="radio"
                    aria-checked={on}
                    accessibilityLabel={`${it.goal.name}, ${pct}. Edit`}
                  >
                    <Text style={styles.goalRowName} numberOfLines={1}>
                      {it.goal.name}
                    </Text>
                    <Text style={styles.goalRowPct}>{pct}</Text>
                  </Pressable>
                );
              })}
              {canAdd && (
                <Pressable
                  onPress={() => setEditing('new')}
                  style={[styles.goalRow, !current && styles.goalRowOn]}
                  accessibilityRole="radio"
                  aria-checked={!current}
                >
                  <Text style={styles.goalRowAdd}>Add a goal</Text>
                </Pressable>
              )}
            </View>
          )}

          <GoalForm
            key={current?.id ?? 'new'}
            goal={current}
            suggestion={suggestedGoalName}
            onSave={(name, target) => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              setGoal({ id: current?.id, name, target });
              leave();
            }}
            onRemove={
              current
                ? () =>
                    Alert.alert('Remove this goal?', `"${current.name}" comes off Home. The money kept does not change.`, [
                      { text: 'Keep it', style: 'cancel' },
                      {
                        text: 'Remove',
                        onPress: () => {
                          removeGoal(current.id);
                          setEditing(null);
                        },
                      },
                    ])
                : undefined
            }
          />
          {!isPremium && visible.length > 0 && (
            <Text style={styles.quiet}>Premium keeps more than one goal.</Text>
          )}

          <Eyebrow style={styles.section}>I moved it</Eyebrow>
          <Text style={styles.bodySmall}>
            Moved real money to it - paid down the card, topped up savings? Log it here. It is kept apart from
            the estimate, so neither is mistaken for the other.
          </Text>
          <View style={styles.inlineRow}>
            <TextInput
              value={movedText}
              onChangeText={setMovedText}
              placeholder="Amount, e.g. 50"
              placeholderTextColor={colors.textFaint}
              keyboardType="decimal-pad"
              returnKeyType="done"
              onSubmitEditing={logIt}
              style={[styles.input, styles.inputFlex]}
              accessibilityLabel="Amount you moved, in dollars"
            />
            <Pressable
              style={[styles.saveButton, parseDollars(movedText) == null && styles.saveButtonOff]}
              onPress={logIt}
              disabled={parseDollars(movedText) == null}
              accessibilityRole="button"
              aria-disabled={parseDollars(movedText) == null}
            >
              <Text style={[styles.saveLabel, parseDollars(movedText) == null && styles.saveLabelOff]}>
                Log it
              </Text>
            </Pressable>
          </View>
          {goalProgress.moved > 0 && (
            <Text style={styles.movedTotal}>Actually moved so far: {formatDollars(goalProgress.moved)}</Text>
          )}
          {recentMoves.map((m) => (
            <Text key={m.at} style={styles.movedRow}>
              {formatDay(localDayKey(new Date(m.at)))} - {formatDollars(m.amount)}
            </Text>
          ))}

          <Pressable
            onPress={() => openPlay('the-chase', 'goal')}
            style={styles.chase}
            accessibilityRole="link"
          >
            <Text style={styles.chaseText}>
              If the number ever starts to feel like money to play with: why chasing never works.
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function GoalForm({
  goal,
  suggestion,
  onSave,
  onRemove,
}: {
  goal: Goal | null;
  suggestion: string;
  onSave: (name: string, target: number | null) => void;
  onRemove?: () => void;
}) {
  const [name, setName] = useState(goal?.name ?? suggestion);
  const [target, setTarget] = useState(goal?.target != null ? String(goal.target) : '');
  const canSave = name.trim().length > 0;

  return (
    <View style={styles.form}>
      <Text style={styles.label}>What is it for?</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder={suggestion}
        placeholderTextColor={colors.textFaint}
        maxLength={60}
        returnKeyType="next"
        style={styles.input}
        accessibilityLabel="Goal name"
      />
      <Text style={styles.label}>Target (optional)</Text>
      <TextInput
        value={target}
        onChangeText={setTarget}
        placeholder="e.g. 1500"
        placeholderTextColor={colors.textFaint}
        keyboardType="number-pad"
        returnKeyType="done"
        style={styles.input}
        accessibilityLabel="Target in dollars, optional"
      />
      <Text style={styles.hint}>No target is fine. There is no deadline and no behind.</Text>
      <View style={styles.saveWrap}>
        <EmberButton
          label={goal ? 'Save goal' : 'Set the goal'}
          disabled={!canSave}
          onPress={() => onSave(name.trim(), parseDollars(target))}
        />
      </View>
      {onRemove && (
        <Pressable onPress={onRemove} hitSlop={8} style={styles.removeHit} accessibilityRole="button">
          <Text style={styles.remove}>Remove this goal</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: spacing.screenX, paddingTop: 12, paddingBottom: 40 },
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
  bodySmall: { fontFamily: fonts.body.regular, fontSize: 13.5, lineHeight: 13.5 * 1.5, color: colors.textMuted },
  section: { marginTop: 32, marginBottom: 8 },
  list: { marginTop: 20 },
  goalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.hairline,
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  goalRowOn: { borderColor: colors.accent, backgroundColor: colors.surfaceWarm },
  goalRowName: { flex: 1, fontFamily: fonts.body.medium, fontSize: 14.5, color: colors.text },
  goalRowPct: { fontFamily: fonts.display.bold, fontSize: 13.5, color: colors.accent },
  goalRowAdd: { fontFamily: fonts.display.bold, fontSize: 14, color: colors.accent },
  form: { marginTop: 12 },
  label: { fontFamily: fonts.body.semibold, fontSize: 13, color: colors.textMuted, marginTop: 14 },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    // textFaint: a field you can find (hairline was 1.26:1).
    borderColor: colors.textFaint,
    borderRadius: spacing.radius,
    paddingVertical: 14,
    paddingHorizontal: 16,
    color: colors.text,
    fontFamily: fonts.body.medium,
    fontSize: 15,
    marginTop: 8,
  },
  inputFlex: { flex: 1, marginTop: 0 },
  hint: { fontFamily: fonts.body.regular, fontSize: 12, color: colors.textDim, marginTop: 8 },
  saveWrap: { marginTop: 18 },
  removeHit: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', marginTop: 6 },
  remove: {
    fontFamily: fonts.body.regular,
    fontSize: 13.5,
    color: colors.textMuted,
    textDecorationLine: 'underline',
  },
  quiet: { fontFamily: fonts.body.regular, fontSize: 12, color: colors.textDim, marginTop: 6 },
  inlineRow: { flexDirection: 'row', alignItems: 'stretch', gap: 10, marginTop: 12 },
  saveButton: {
    borderWidth: 1.5,
    borderColor: colors.accent,
    borderRadius: spacing.radius,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  saveButtonOff: { borderColor: colors.hairline },
  saveLabel: { fontFamily: fonts.display.bold, fontSize: 15, color: colors.accent },
  saveLabelOff: { color: colors.textFaint },
  movedTotal: { fontFamily: fonts.body.medium, fontSize: 13.5, color: colors.text, marginTop: 12 },
  movedRow: { fontFamily: fonts.body.regular, fontSize: 12.5, color: colors.textDim, marginTop: 4 },
  chase: { marginTop: 30, minHeight: 44, justifyContent: 'center' },
  chaseText: {
    fontFamily: fonts.body.regular,
    fontSize: 13,
    lineHeight: 13 * 1.5,
    color: colors.textMuted,
    textDecorationLine: 'underline',
  },
});
