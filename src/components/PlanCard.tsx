import React from 'react';
import { HomeCard } from '@/components/HomeCard';
import type { TodaysPlays } from '@/lib/todaysPlay';
import { type IfThenPlan, planSentence } from '@/state/plans';

/**
 * Today's play on Home (hook 5). Before a plan is picked it names the day's
 * risk ("Payday.") and asks for one tap; once picked, the plan itself stays
 * pinned here for the rest of the day.
 */
export function PlanCard({
  plays,
  pinned,
  onPress,
}: {
  plays: TodaysPlays;
  pinned: IfThenPlan | null;
  onPress: () => void;
}) {
  if (pinned) {
    return (
      <HomeCard
        eyebrow="Today's play"
        title={planSentence(pinned)}
        sub="Pinned for today."
        titleLines={4}
        onPress={onPress}
        hint="Opens today's plans"
      />
    );
  }
  return (
    <HomeCard
      eyebrow="Today's play"
      title={plays.headline}
      sub="Pick one if-then plan for today. One tap."
      onPress={onPress}
      hint="Opens three plans to pick from"
    />
  );
}
