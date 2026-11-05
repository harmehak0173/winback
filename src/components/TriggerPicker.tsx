import React, { useState } from 'react';
import { AccessibilityInfo, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Eyebrow } from '@/components/Eyebrow';
import { track } from '@/lib/analytics';
import { logTrigger, TRIGGER_OPTIONS, TRIGGER_SHORT, type TriggerKind } from '@/lib/triggers';
import { colors, fonts, spacing } from '@/theme/tokens';

/**
 * "What was happening right before?" as tappable chips.
 *
 * One tap, no submit button, no text field, and nothing is required. Asking
 * someone mid-craving to type is asking them to do nothing, and a required
 * field on a relapse screen would make honesty cost something.
 *
 * Deliberately does not ask "why". Why invites answers about character, which
 * is the attribution that turns one bet into a run of them. What was happening
 * invites answers about situations, which are the things a person can plan
 * around next time.
 *
 * The options are TRIGGER_OPTIONS in order, so they include "Saw a promo or
 * ad" - not a quiz answer, but a trigger the betting companies aim on purpose.
 * `onPick` hands the choice (its TRIGGER_OPTIONS index) to the screen, for
 * anything that follows from it, such as the slip debrief's plan.
 */
export function TriggerPicker({
  kind,
  label = 'What was happening?',
  onPick,
  inset = true,
}: {
  kind: TriggerKind;
  label?: string;
  onPick?: (index: number, option: string) => void;
  /** Pad to the screen edge. Off inside content that is already padded. */
  inset?: boolean;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const pad = inset ? styles.inset : null;

  const choose = (option: string, index: number) => {
    if (picked) return;
    setPicked(option);
    // The live region on the confirmation is Android-only.
    if (Platform.OS === 'ios') {
      AccessibilityInfo.announceForAccessibility(
        `Noted. ${TRIGGER_SHORT[option] ?? option}. This shows up in your patterns.`,
      );
    }
    // Which kind of moment, never which trigger: first party only.
    track('trigger_logged', { kind });
    void logTrigger(option, kind);
    onPick?.(index, option);
  };

  return (
    <View style={styles.wrap}>
      <Eyebrow style={{ ...styles.label, ...pad }}>{picked ? 'Noted' : label}</Eyebrow>
      {picked ? (
        <Text style={[styles.done, pad]} accessibilityLiveRegion="polite">
          {TRIGGER_SHORT[picked] ?? picked}. This shows up in your patterns.
        </Text>
      ) : (
        <>
          <View style={[styles.chips, pad]}>
            {TRIGGER_OPTIONS.map((option, i) => (
              <Pressable
                key={option}
                style={styles.chip}
                onPress={() => choose(option, i)}
                accessibilityRole="button"
                // The words on the chip are its name (Voice Control users say
                // what they see); the full phrase goes in the hint.
                accessibilityHint={`Logs "${option}" as what set it off`}
              >
                <Text style={styles.chipLabel}>{TRIGGER_SHORT[option] ?? option}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={[styles.skip, pad]}>Optional. Skip it and nothing is lost.</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 26 },
  inset: { paddingHorizontal: spacing.screenX },
  label: { marginBottom: 10 },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 14,
    minHeight: 44,
    justifyContent: 'center',
  },
  chipLabel: { fontFamily: fonts.body.medium, fontSize: 13, color: colors.text },
  skip: {
    fontFamily: fonts.body.regular,
    fontSize: 11.5,
    color: colors.textFaint,
    marginTop: 10,
  },
  done: {
    fontFamily: fonts.body.regular,
    fontSize: 13.5,
    color: colors.textMuted,
  },
});
