import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Lifetime } from '@/state/AppState';
import { CUT_LINES } from '@/state/cutLines';
import { colors, fonts } from '@/theme/tokens';

/**
 * The wins column (hooks 2, 6, 7, 10). Lifetime totals that only ever go up:
 * a slip resets the run, never these. They sit next to the run on purpose -
 * the all-or-nothing story ("one bet and it's all gone") is what turns a slip
 * into a relapse, and these numbers are the proof that it is not true.
 *
 * Nights closed and reps only appear once used, so nobody is shown a row of
 * zeros for features they never picked up.
 */
export function LifetimeStats({ lifetime }: { lifetime: Lifetime }) {
  const tiles: { value: string; label: string }[] = [
    { value: String(lifetime.cleanDaysLogged), label: 'Clean days logged' },
    { value: String(lifetime.closeCallsBeaten), label: 'Close calls beaten' },
    { value: String(lifetime.urgesRiddenOut), label: 'Urges ridden out' },
    { value: `${lifetime.linesCut} of ${CUT_LINES.length}`, label: 'Lines cut' },
    { value: String(lifetime.plansHeld), label: 'Plans held' },
    { value: String(lifetime.gamesWatchedClean), label: 'Games watched clean' },
  ];
  if (lifetime.nightsClosed > 0) {
    tiles.push({ value: String(lifetime.nightsClosed), label: 'Nights closed out' });
  }
  if (lifetime.repsDone > 0) tiles.push({ value: String(lifetime.repsDone), label: 'Reps in the bank' });

  return (
    <View style={styles.grid}>
      {tiles.map((t) => (
        <View
          key={t.label}
          style={styles.tile}
          accessible
          accessibilityRole="text"
          accessibilityLabel={`${t.label}: ${t.value}`}
        >
          <Text style={styles.value} maxFontSizeMultiplier={1.3} numberOfLines={1} adjustsFontSizeToFit>
            {t.value}
          </Text>
          <Text style={styles.label}>{t.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: {
    // Two per row with the 10pt gap between them.
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  value: {
    fontFamily: fonts.display.extrabold,
    fontSize: 24,
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  label: { fontFamily: fonts.body.regular, fontSize: 12, color: colors.textDim, marginTop: 2 },
});
