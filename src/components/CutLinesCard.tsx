import React from 'react';
import { HomeCard } from '@/components/HomeCard';
import { CUT_LINES, type CutLine } from '@/state/cutLines';

/**
 * Cut the lines on Home (hook 6): today's one-minute task that shuts a
 * channel the betting companies use to reach you. One a day - once today's
 * is marked, the card says so and waits for tomorrow.
 */
export function CutLinesCard({
  next,
  linesCut,
  markedToday,
  onPress,
}: {
  next: CutLine;
  linesCut: number;
  markedToday: boolean;
  onPress: () => void;
}) {
  const progress = `Lines cut: ${linesCut} of ${CUT_LINES.length}`;
  if (markedToday) {
    return (
      <HomeCard
        eyebrow="Cut the lines"
        title="Next one tomorrow."
        sub={progress}
        done
        onPress={onPress}
        hint="Opens the list of lines to cut"
      />
    );
  }
  return (
    <HomeCard
      eyebrow={`Cut the lines · ${linesCut} of ${CUT_LINES.length}`}
      title={next.title}
      sub={next.big ? 'A bigger one. Take your time, or skip it.' : 'One a day. About a minute. Skip any of them.'}
      onPress={onPress}
      hint="Opens the steps"
    />
  );
}
