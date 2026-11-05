import { useRouter } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { EmberButton } from '@/components/EmberButton';
import { Screen } from '@/components/Screen';
import { useAppState } from '@/state/AppState';
import { ANCHOR_LINES } from '@/state/quiz-data';
import { colors, fonts, tracking } from '@/theme/tokens';

/**
 * Cost reveal 2 - the anchor line, chosen by spend tier.
 *
 * The proof line is a published finding, stated as the source states it:
 * Taylor, McCarthy and Wilbur, "Online Gambling Policy Effects on Tax Revenue
 * and Irresponsible Gambling" (MSI working paper, 2024). In digital payment
 * records for 717,724 US online gamblers, 96% appeared to lose money and 4%
 * made money (UC San Diego Rady School release, 2024-07-23). It is about
 * online gambling in general, not sports betting alone, so the line says
 * "online gamblers".
 */
export default function Reveal2() {
  const router = useRouter();
  const { spendIndex } = useAppState();

  return (
    <Screen style={styles.screen}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.center}>
        <Text style={styles.anchor} accessibilityRole="header">
          {ANCHOR_LINES[spendIndex]}
        </Text>
        <Text style={styles.proof}>
          Of more than 700,000 US online gamblers in a 2024 UC San Diego study, only 4% made
          money. The betting companies are built on it.
        </Text>
      </ScrollView>
      <EmberButton label="Continue" onPress={() => router.push('/onboarding/reveal-3')} style={styles.cta} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 30, paddingBottom: 30 },
  scroll: { flex: 1 },
  center: { flexGrow: 1, justifyContent: 'center', paddingVertical: 20 },
  anchor: {
    fontFamily: fonts.display.extrabold,
    fontSize: 38,
    lineHeight: 38 * 1.15,
    letterSpacing: tracking(38),
    color: colors.text,
  },
  proof: {
    fontFamily: fonts.body.regular,
    fontSize: 13.5,
    lineHeight: 13.5 * 1.55,
    color: colors.textDim,
    marginTop: 22,
  },
  cta: { marginTop: 12 },
});
