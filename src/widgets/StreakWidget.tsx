import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import type { WidgetView } from './update';

/**
 * Home-screen widget: days clean, money won back, and today's close-out state.
 *
 * The close-out line is the point. A widget that only reports a number is
 * wallpaper; one that shows an unfinished action is a reason to open the app.
 * Duolingo's streak widget works because it looks different when you have not
 * done today yet - this does the same, in our language.
 *
 * Discreet mode swaps in a neutral face: no day count, no money, no recovery
 * or betting words, because the home screen is the most visible surface on the
 * phone. The today-state still changes, so the widget keeps doing its job.
 *
 * Tapping it while today is open goes straight to the close-out
 * (winback://closeout); once today is done it just opens the app.
 *
 * Rendered by the headless task handler from a snapshot the app writes, since
 * widgets cannot tick live and Android throttles updates to roughly 30 minutes.
 */
const BG = '#0A0B0D';
const TEXT = '#F2F3F5';
const ACCENT = '#FF8A3D';
const DIM = '#7a8089';
// Was #6b7078 (3.95:1 on the widget); now the dim tone, 4.95:1.
const FAINT = DIM;
const PILL_DONE = '#14161A';
const PILL_OPEN = '#2A1710';

const CLOSEOUT_URI = 'winback://closeout';

export function StreakWidget({ discreet, hasStreak, days, money, checkedInToday }: WidgetView) {
  const open = hasStreak && !checkedInToday;
  const pill = discreet
    ? checkedInToday
      ? 'Checked in'
      : 'Check in'
    : checkedInToday
      ? 'Closed out today'
      : 'Close out today';

  const label = discreet
    ? `Today: ${checkedInToday ? 'done' : 'open'}`
    : `${days} ${days === 1 ? 'day' : 'days'} clean, ${money} won back. ${pill}.`;

  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: BG,
        borderRadius: 20,
        padding: 14,
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
      clickAction={open ? 'OPEN_URI' : 'OPEN_APP'}
      clickActionData={open ? { uri: CLOSEOUT_URI } : undefined}
      accessibilityLabel={label}
    >
      {discreet ? (
        <FlexWidget style={{ flexDirection: 'column' }}>
          <TextWidget
            text="TODAY"
            style={{ fontSize: 9.5, letterSpacing: 1.8, color: DIM, fontWeight: '600' }}
          />
          <TextWidget
            text={checkedInToday ? 'Done' : 'Open'}
            style={{ fontSize: 34, color: TEXT, fontWeight: 'bold' }}
          />
        </FlexWidget>
      ) : (
        <FlexWidget style={{ flexDirection: 'column' }}>
          <TextWidget
            text="DAYS CLEAN"
            style={{ fontSize: 9.5, letterSpacing: 1.8, color: DIM, fontWeight: '600' }}
          />
          <FlexWidget style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
            <TextWidget text={String(days)} style={{ fontSize: 40, color: TEXT, fontWeight: 'bold' }} />
            <TextWidget
              text={`  ${money}`}
              style={{ fontSize: 15, color: ACCENT, fontWeight: 'bold', marginBottom: 6 }}
            />
            <TextWidget text=" won back" style={{ fontSize: 10, color: FAINT, marginBottom: 7 }} />
          </FlexWidget>
        </FlexWidget>
      )}

      <FlexWidget
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          borderRadius: 9,
          paddingHorizontal: 9,
          paddingVertical: 6,
          backgroundColor: open ? PILL_OPEN : PILL_DONE,
        }}
      >
        <TextWidget
          text={pill}
          style={{ fontSize: 11.5, fontWeight: 'bold', color: open ? ACCENT : DIM }}
        />
      </FlexWidget>
    </FlexWidget>
  );
}
