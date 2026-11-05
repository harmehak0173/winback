import React from 'react';
import { HomeCard } from '@/components/HomeCard';
import type { TodaysMove } from '@/lib/daily';

/**
 * The daily card on Home (hook 4).
 *
 * Premium (including the free week) gets the day's one-minute read. Everyone
 * else gets Today's move: the same day's protective action on its own, free,
 * because deleting the apps or telling one person is the part that protects
 * someone. What Premium adds is the why behind it - said once, on the daily
 * screen, not here. No lock, no blurred preview, no countdown.
 */
export function TodayMoveCard({
  move,
  isPremium,
  onPress,
}: {
  move: TodaysMove;
  isPremium: boolean;
  onPress: () => void;
}) {
  if (isPremium) {
    return (
      <HomeCard
        eyebrow={move.readToday ? 'Read for today' : `Today's read · Day ${move.dayNumber} of 28`}
        title={move.item.title}
        titleLines={2}
        sub={move.readToday ? 'Tomorrow’s is ready in the morning.' : 'About a minute.'}
        done={move.readToday}
        onPress={onPress}
        hint="Opens today's read"
      />
    );
  }
  return (
    <HomeCard
      eyebrow={`Today's move · Day ${move.dayNumber}`}
      title={move.text}
      titleLines={3}
      sub={move.readToday ? 'Done. See you tomorrow.' : 'One small move. About a minute.'}
      done={move.readToday}
      onPress={onPress}
      hint="Opens today's move"
    />
  );
}
