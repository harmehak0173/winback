import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback } from 'react';
import {
  BackHandler,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { EmberButton } from '@/components/EmberButton';
import { HelplineName } from '@/components/HelplineRow';
import { ShieldIcon } from '@/components/icons';
import { Screen } from '@/components/Screen';
import {
  canCallAndText,
  deviceDirectoryLine,
  deviceHelplines,
  helplineHint,
  helplineLabel,
  openHelpline,
  useRegionKnown,
} from '@/lib/helplines';
import { colors, fonts } from '@/theme/tokens';

/**
 * Conditional safety interstitial (Q7 includes "Savings or debt" AND Q8 = Yes).
 * Helplines also live permanently in Settings (You tab) and on the Panic
 * screen - always outside the paywall.
 *
 * Scrolls, because the list is not a fixed length: a phone we cannot place in
 * a region gets every line we have, which is taller than any screen, and at
 * the largest text sizes even three cards overflow a small phone.
 */
export default function Safety() {
  const router = useRouter();
  // Region lines wait for the web's hydration (see useRegionKnown).
  const regionKnown = useRegionKnown();
  const lines = regionKnown ? [...deviceHelplines()] : [];
  const directory = regionKnown ? deviceDirectoryLine() : null;
  if (directory) lines.push(directory);

  const done = useCallback(() => router.replace('/(tabs)'), [router]);
  // As in HelplineRow: at large text the "Text" pill drops under the number.
  const stack = useWindowDimensions().fontScale >= 1.3;

  // Commit replaced itself with this screen, so Android back would land on
  // the last reveal and invite a second commit (which restarts the clock).
  // Back from here means "done", the same as Got it.
  useFocusEffect(
    useCallback(() => {
      // Hardware back is Android's; on the web the call only logs an error.
      if (Platform.OS !== 'android') return;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        done();
        return true;
      });
      return () => sub.remove();
    }, [done]),
  );

  return (
    <Screen style={styles.screen}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.center}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.shield}>
          <ShieldIcon color={colors.accent} />
        </View>
        <Text style={styles.headline} accessibilityRole="header">
          Quitting is harder when you're carrying it alone.
        </Text>
        <Text style={styles.body}>
          Winback will be with you every day - and if it ever feels like more than an app can
          help with, real people are ready to talk:
        </Text>
        {/* Each row now carries its own hours, because they are not identical
            across markets and rounding a line up to "24/7" would send someone
            to a recording at 3am. */}
        <View style={styles.cards}>
          {lines.map((line) => {
            const web = line.uri.startsWith('https:');
            return (
              <View key={line.name + line.uri} style={[styles.card, stack && styles.cardStacked]}>
                <Pressable
                  style={[styles.cardMain, stack && styles.cardMainStacked]}
                  onPress={() => void openHelpline(line)}
                  accessibilityRole={web ? 'link' : 'button'}
                  accessibilityLabel={helplineLabel(line)}
                  accessibilityHint={web ? helplineHint(line) : undefined}
                >
                  <HelplineName line={line} style={styles.cardTitle} />
                  <Text style={styles.cardSub}>{line.sub}</Text>
                </Pressable>
                {canCallAndText(line) && (
                  <Pressable
                    style={[styles.textButton, stack && styles.textButtonStacked]}
                    onPress={() => void openHelpline(line, 'text')}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel={helplineLabel(line, 'text')}
                    accessibilityHint={helplineHint(line, 'text')}
                  >
                    <Text style={styles.textButtonLabel}>Text</Text>
                  </Pressable>
                )}
              </View>
            );
          })}
        </View>
        <Text style={styles.note}>
          Winback is a support tool, not a medical device or treatment. For medical advice,
          diagnosis or treatment, talk to a doctor or other healthcare professional.
        </Text>
      </ScrollView>
      <EmberButton label="Got it" onPress={done} style={styles.cta} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 30, paddingBottom: 34 },
  scroll: { flex: 1 },
  // flexGrow keeps the block vertically centred when it fits, and lets it
  // scroll from the top when it does not.
  center: { flexGrow: 1, justifyContent: 'center', paddingVertical: 20 },
  shield: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
  },
  headline: {
    fontFamily: fonts.display.extrabold,
    fontSize: 24,
    lineHeight: 24 * 1.25,
    color: colors.text,
  },
  body: {
    fontFamily: fonts.body.regular,
    fontSize: 15,
    lineHeight: 15 * 1.6,
    color: colors.textMuted,
    marginTop: 16,
  },
  cards: { marginTop: 18, gap: 10 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 14,
    paddingRight: 12,
  },
  cardMain: { flex: 1, paddingVertical: 14, paddingLeft: 16, paddingRight: 8 },
  cardTitle: { fontFamily: fonts.display.bold, fontSize: 15, color: colors.text },
  cardSub: { fontFamily: fonts.body.regular, fontSize: 12.5, color: colors.textDim, marginTop: 2 },
  textButton: {
    borderWidth: 1.5,
    borderColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  textButtonLabel: { fontFamily: fonts.display.bold, fontSize: 13, color: colors.accent },
  cardStacked: { flexWrap: 'wrap' },
  cardMainStacked: { flexBasis: '100%' },
  textButtonStacked: { marginLeft: 16, marginBottom: 12 },
  note: {
    fontFamily: fonts.body.regular,
    fontSize: 12.5,
    lineHeight: 12.5 * 1.5,
    color: colors.textDim,
    marginTop: 16,
  },
  cta: { marginTop: 12 },
});
