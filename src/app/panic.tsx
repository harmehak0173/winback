import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BreathingGuide } from '@/components/BreathingGuide';
import { EmberButton } from '@/components/EmberButton';
import { Eyebrow } from '@/components/Eyebrow';
import { GroundingExercise } from '@/components/GroundingExercise';
import { HelplineRow, helplineRowStyles } from '@/components/HelplineRow';
import { MessageIcon, XIcon } from '@/components/icons';
import { Screen } from '@/components/Screen';
import { useNow } from '@/hooks/useNow';
import { useScreenReader } from '@/hooks/useScreenReader';
import {
  deviceDirectoryLine,
  deviceHelplines,
  HELPLINE_DIRECTORY,
  isLongList,
  otherHelplines,
  useRegionKnown,
} from '@/lib/helplines';
import { TriggerPicker } from '@/components/TriggerPicker';
import { noteUrgeSession } from '@/lib/review';
import { track } from '@/lib/analytics';
import { preloadCues, releaseCues, stopCues } from '@/lib/cueAudio';
import { minSec } from '@/lib/format';
import { getReminderPermission } from '@/lib/notifications';
import { markPanicSession } from '@/lib/panicSession';
import { BLOCK_TEXT, smsPartner, URGE_TEXT } from '@/lib/partner';
import { useMyReasons } from '@/lib/reasons';
import { logTrigger, TRIGGER_OPTIONS, TRIGGER_UNDO_BLOCK } from '@/lib/triggers';
import { logUrgeEnd, logUrgeStart } from '@/lib/urgeLog';
import { stopSpeaking, warmUpVoice } from '@/lib/voice';
import { useAppState } from '@/state/AppState';
import { PATTERNS } from '@/state/breathing';
import { COST_NOTHING_YET, GOAL_PAYWALL, QUESTIONS } from '@/state/quiz-data';
import { colors, fonts, spacing, tracking } from '@/theme/tokens';

type Mode = 'breathe' | 'ground';

/** A session this long or longer can end with the offer of a check-in. */
const FOLLOW_UP_MIN_SESSION_MS = 2 * 60_000;
/** The check-in comes this long after "I'm past it". */
const FOLLOW_UP_AFTER_MS = 60 * 60_000;
/** At most one check-in per this window, counted from when it was asked for. */
const FOLLOW_UP_WINDOW_MS = 6 * 60 * 60_000;

/**
 * Panic - in-the-moment urge support. Free forever, reachable from anywhere.
 * A calm-kit: paced breathing (three common patterns) or 5-4-3-2-1
 * grounding, a spoken guide, the urge timer, the user's own reasons, and the
 * helplines - all outside any paywall.
 */

export default function Panic() {
  // Region lines wait for the web's hydration (see useRegionKnown); on a
  // phone they are there from the first frame.
  const regionKnown = useRegionKnown();
  const helplines = regionKnown ? deviceHelplines() : [];
  const otherLines = regionKnown ? otherHelplines() : [];
  const directory = regionKnown ? deviceDirectoryLine() : null;
  // Canada's provincial lines and the everything-list render tighter.
  const compactRows = isLongList(helplines);
  const [showOtherLines, setShowOtherLines] = useState(false);
  const router = useRouter();
  // A reminder tap (halftime, say) can open this in a public place, so the
  // link may ask for the voice to start muted.
  // `moment=block` opens straight on "About to switch off a block?".
  const { voice, moment } = useLocalSearchParams<{ voice?: string; moment?: string }>();
  const {
    answers,
    goalIndex,
    partner,
    favouritePattern,
    logUrgeWin,
    urgeFollowUpAt,
    setUrgeFollowUp,
  } = useAppState();
  const [startedAt] = useState(() => Date.now());
  // The recorded voice talks over a screen reader, so with one on it starts
  // muted (one tap turns it on). A link's voice=off and the person's own
  // choice always win.
  const readerOn = useScreenReader();
  const [voicePref, setVoicePref] = useState<boolean | null>(voice === 'off' ? false : null);
  const voiceOn = voicePref ?? !readerOn;
  const [mode, setMode] = useState<Mode>('breathe');
  // Opens on the pattern they have practised ("your go-to"), Calm otherwise.
  // Derived rather than seeded: opened cold from a reminder, this screen
  // renders before state has loaded, and a seeded value would stay on Calm.
  const [pickedPattern, setPatternId] = useState<string | null>(null);
  const patternId = pickedPattern ?? favouritePattern ?? 'calm';
  const now = useNow();
  // How the session ended, for the close event: "I'm past it" is an urge
  // ridden out; the X (or a swipe down) is not the same thing.
  const outcome = useRef<'past_it' | 'closed'>('closed');
  // "I'm past it" was tapped and the check-in is being offered.
  const [rodeItOut, setRodeItOut] = useState(false);
  const [followUpAsked, setFollowUpAsked] = useState(false);

  // "About to switch off a block?": the moment reviews of every gambling
  // blocker describe losing. Tapping it logs the moment once (to the device's
  // trigger log, first party only), so it shows up in their own patterns. A
  // link opened straight on the card (`moment=block`) shows it but logs
  // nothing: any web page can open that link, and only a tap is theirs.
  const [blockMoment, setBlockMoment] = useState(moment === 'block');
  const openBlockMoment = () => {
    setBlockMoment(true);
    void logTrigger(TRIGGER_OPTIONS[TRIGGER_UNDO_BLOCK], 'urge');
    track('panic_block_moment');
    AccessibilityInfo.announceForAccessibility(
      'About to switch off a block? That is the urge asking, not you deciding.',
    );
  };

  // Load the voice clips during the first render, not in the effect below.
  // The breathing guide is a child, and React runs children's effects first,
  // so its opening "Breathe in" fired before a mount effect here could load
  // anything - and fell back to a different, system voice every time.
  useState(() => {
    preloadCues();
    return true;
  });

  const pattern = PATTERNS.find((p) => p.id === patternId) ?? PATTERNS[0];

  useEffect(() => {
    track('panic_opened');
    // Holds the end-of-free-week paywall back for a while after a craving.
    markPanicSession();
    // Starts the rating-prompt cooldown. Surviving a craving reads like a
    // completed task, which is exactly why it must not become a review moment.
    void noteUrgeSession();
    // This session's own row, so its end time can never land on another.
    const session = logUrgeStart();
    preloadCues(); // no-op unless a remount released them
    void warmUpVoice(); // ready the TTS fallback (web / a clip that won't play)
    const openedAt = Date.now();
    return () => {
      track('panic_closed', {
        seconds: Math.round((Date.now() - openedAt) / 1000),
        outcome: outcome.current,
      });
      // Again on the way out, so the quiet window runs from the END of the
      // session. Marked only at open, anyone who rode an urge out for more
      // than ten minutes (the playbook's own 20-minute rule, or a helpline
      // call from here) met the paywall seconds after "I'm past it".
      markPanicSession();
      void logUrgeEnd(session);
      stopSpeaking();
      releaseCues();
    };
  }, []);

  // Muting silences the current cue immediately, not just future ones.
  useEffect(() => {
    if (!voiceOn) {
      stopCues();
      stopSpeaking();
    }
  }, [voiceOn]);

  const textPartner = () => void smsPartner(partner, URGE_TEXT);

  const costQ = QUESTIONS.find((q) => q.id === 'cost')!;
  const costIdxs = Array.isArray(answers.cost) ? answers.cost : [];
  const reasons = costIdxs
    .filter((i) => i !== COST_NOTHING_YET)
    .slice(0, 3)
    .map((i) => costQ.options[i].toLowerCase());
  const reasonsText = reasons.length ? reasons.join(', ') : 'the life you actually want';
  // Their own words beat the quiz's, so when they wrote some (You -> Your
  // reasons) those are shown instead, one to a line, exactly as typed.
  const ownReasons = useMyReasons();

  const close = (how: 'past_it' | 'closed') => {
    // Once ridden out, it stays ridden out, however the screen is then left.
    if (outcome.current !== 'past_it') outcome.current = how;
    stopSpeaking();
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  /**
   * "I'm past it": an urge ridden out, logged to the wins column. The X does
   * not log anything, so an accidental open never counts as a win.
   *
   * After a longer session, one check-in an hour later is offered - opt-in,
   * at most one per six hours, and only where reminders can actually arrive.
   * Otherwise the screen simply closes.
   */
  const pastIt = async () => {
    if (rodeItOut || outcome.current === 'past_it') return;
    outcome.current = 'past_it';
    logUrgeWin('panic', new Date(startedAt).toISOString());
    const at = Date.now();
    const lastAsked = urgeFollowUpAt ? Date.parse(urgeFollowUpAt) - FOLLOW_UP_AFTER_MS : NaN;
    const recentlyAsked = Number.isFinite(lastAsked) && at - lastAsked < FOLLOW_UP_WINDOW_MS;
    if (at - startedAt < FOLLOW_UP_MIN_SESSION_MS || recentlyAsked) {
      close('past_it');
      return;
    }
    // The coaching is over: stop the clip playing now, and the guide below
    // stays silent from here (voiceOn && !rodeItOut).
    stopSpeaking();
    stopCues();
    const permission = await getReminderPermission();
    if (permission !== 'granted') {
      close('past_it');
      return;
    }
    setRodeItOut(true);
    // The button that had focus is gone; say what replaced it.
    AccessibilityInfo.announceForAccessibility(
      'You rode it out. Close, or ask for a check-in in an hour.',
    );
  };

  const askFollowUp = () => {
    // Asking for it is the opt-in: setUrgeFollowUp also turns the switch in
    // You on (without a settings event), and turning it off there cancels a
    // pending one.
    setUrgeFollowUp(new Date(Date.now() + FOLLOW_UP_AFTER_MS).toISOString());
    setFollowUpAsked(true);
  };

  return (
    <Screen onEscape={() => close('closed')}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* The headline comes first in reading order, so a screen reader
            opens on what this screen is for. The close button is drawn at
            the top right but read after it. */}
        <View style={styles.headlineBlock}>
          <Text style={styles.headline} accessibilityRole="header">
            The urge is here.{'\n'}Ride it out.
          </Text>
          <Text style={styles.sub}>
            Urges build, peak and pass. You don't have to beat this one, just outlast it.
          </Text>
        </View>
        <View style={styles.closeRow}>
          <Pressable
            style={styles.closeButton}
            onPress={() => close('closed')}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <XIcon color={colors.textMuted} />
          </Pressable>
        </View>

        {/* Mode toggle */}
        <View style={styles.segment} accessibilityRole="tablist">
          {(['breathe', 'ground'] as Mode[]).map((m, i) => (
            <Pressable
              key={m}
              onPress={() => {
                stopSpeaking();
                setMode(m);
              }}
              style={[styles.segBtn, mode === m && styles.segBtnActive]}
              // iOS gives the tab role no trait, so it is a button there that
              // says "tab, 1 of 2", the way the tab bar does.
              accessibilityRole={Platform.OS === 'ios' ? 'button' : 'tab'}
              aria-selected={mode === m}
              accessibilityLabel={`${m === 'breathe' ? 'Breathe' : 'Ground'}${Platform.OS === 'ios' ? `, tab, ${i + 1} of 2` : ''}`}
            >
              <Text style={[styles.segLabel, mode === m && styles.segLabelActive]}>
                {m === 'breathe' ? 'Breathe' : 'Ground'}
              </Text>
            </Pressable>
          ))}
        </View>

        {mode === 'breathe' ? (
          <>
            <View style={styles.chips} accessibilityRole="radiogroup">
              {PATTERNS.map((p) => (
                <Pressable
                  key={p.id}
                  onPress={() => setPatternId(p.id)}
                  style={[styles.chip, patternId === p.id && styles.chipActive]}
                  accessibilityRole="radio"
                  aria-checked={patternId === p.id}
                  // Spoken without the middle dots ("4 7 8, Deep calm").
                  accessibilityLabel={`${p.name.replace(/ · /g, ' ')}, ${p.detail.replace(/ · /g, ' ')}${favouritePattern === p.id ? ', your go-to' : ''}`}
                >
                  <Text style={[styles.chipName, patternId === p.id && styles.chipNameActive]}>
                    {p.name}
                  </Text>
                  <Text style={styles.chipDetail}>
                    {favouritePattern === p.id ? 'Your go-to' : p.detail}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.guideWrap}>
              <BreathingGuide pattern={pattern} voiceOn={voiceOn && !rodeItOut} />
            </View>
          </>
        ) : (
          <GroundingExercise voiceOn={voiceOn && !rodeItOut} />
        )}

        <View style={styles.metaRow}>
          <Text style={styles.timer}>Riding it out · {minSec(now - startedAt)}</Text>
          {/* A button named by what it does, so the name spoken is the words
              on screen (Voice Control users say what they see). */}
          <Pressable onPress={() => setVoicePref(!voiceOn)} hitSlop={8} accessibilityRole="button">
            <Text style={styles.voiceToggle}>{voiceOn ? 'Mute voice' : 'Unmute voice'}</Text>
          </Pressable>
        </View>
        {/* Required by the voice's maker, and fair to the listener: the
            recorded guide is synthetic, not a person. */}
        <Text style={styles.voiceNote}>Voice is AI-generated</Text>

        {blockMoment ? (
          <View style={styles.card}>
            <Eyebrow letterSpacingEm={0.22}>About to switch off a block?</Eyebrow>
            <Text style={styles.reasons}>
              That is the urge asking, not you deciding. The block is doing its job. Leave it
              alone for the next 20 minutes, then decide.
            </Text>
            {partner ? (
              <Pressable
                style={styles.blockButton}
                onPress={() => void smsPartner(partner, BLOCK_TEXT)}
                accessibilityRole="button"
                accessibilityLabel={`Text ${partner.name}`}
                accessibilityHint="Opens a message asking them to talk you out of it"
              >
                <Text style={styles.blockButtonLabel}>Text {partner.name}</Text>
              </Pressable>
            ) : (
              <Text style={styles.goal}>
                Calling a line below works too. You do not have to explain anything.
              </Text>
            )}
          </View>
        ) : (
          <Pressable onPress={openBlockMoment} style={styles.linkHit} accessibilityRole="button">
            <Text style={styles.otherLinesLink}>About to switch off a block?</Text>
          </Pressable>
        )}

        <View style={styles.card}>
          <Eyebrow letterSpacingEm={0.22}>Your reasons</Eyebrow>
          {ownReasons.length ? (
            <>
              <Text style={styles.reasons}>You&apos;re doing this for:</Text>
              {ownReasons.map((reason) => (
                <Text key={reason} style={[styles.ownReason, styles.reasonsAccent]}>
                  {reason}
                </Text>
              ))}
            </>
          ) : (
            <Text style={styles.reasons}>
              You're doing this for <Text style={styles.reasonsAccent}>{reasonsText}</Text>.
            </Text>
          )}
          <Text style={styles.goal}>
            And the money's going toward{' '}
            <Text style={styles.goalStrong}>{GOAL_PAYWALL[goalIndex]}</Text> - not their revenue.
          </Text>
        </View>

        {partner && (
          <View style={[helplineRowStyles.helpline, styles.helplineSpacing]}>
            <Pressable
              style={helplineRowStyles.helplineMain}
              onPress={textPartner}
              accessibilityRole="button"
              accessibilityLabel={`Text ${partner.name}`}
              accessibilityHint="Opens a text asking if they can talk for a minute"
            >
              <MessageIcon color={colors.accent} />
              <View style={helplineRowStyles.helplineText}>
                <Text style={helplineRowStyles.helplineTitle}>Text {partner.name}</Text>
                <Text style={helplineRowStyles.helplineSub}>
                  Your corner. One tap, no explaining needed.
                </Text>
              </View>
            </Pressable>
          </View>
        )}

        {/* Every line is its own tap target, and they come from one shared
            list so this screen can never again offer fewer numbers than the
            You tab. Only the user's own region shows here: someone mid-craving
            should not have to read past foreign numbers to find the one they
            can actually call. */}
        {helplines.map((line) => (
          <HelplineRow key={line.name + line.uri} line={line} style={styles.helplineSpacing} compact={compactRows} />
        ))}
        {directory && <HelplineRow line={directory} style={styles.helplineSpacing} />}

        {/* Asked here rather than at the top: someone who has just opened this
            screen is riding out a craving, not categorising it. By the time
            they have scrolled past the timer and their own reasons, the worst
            of it has usually passed and the question is answerable. */}
        <TriggerPicker kind="urge" label="What set this off?" />

        {/* Region detection can be wrong - a Canadian phone set to the US
            region would otherwise leave someone in a craving with no line they
            can actually reach. One tap, and never more than that. The
            worldwide directory closes the list for anyone further afield. */}
        {otherLines.length > 0 && !showOtherLines && (
          <Pressable
            onPress={() => {
              setShowOtherLines(true);
              AccessibilityInfo.announceForAccessibility(`${otherLines.length + 1} more helplines shown below.`);
            }}
            style={styles.linkHit}
            accessibilityRole="button"
            accessibilityLabel="Somewhere else? Other helplines"
          >
            <Text style={styles.otherLinesLink}>Somewhere else? Other helplines</Text>
          </Pressable>
        )}
        {showOtherLines && (
          <>
            {otherLines.map((line) => (
              <HelplineRow key={line.name + line.uri} line={line} style={styles.helplineSpacing} compact={isLongList(otherLines)} />
            ))}
            <HelplineRow line={HELPLINE_DIRECTORY} style={styles.helplineSpacing} />
          </>
        )}

        <View style={styles.footer}>
          {rodeItOut ? (
            <View style={styles.doneCard} accessibilityLiveRegion="polite">
              <Text style={styles.doneTitle} accessibilityRole="header">
                You rode it out.
              </Text>
              <Text style={styles.doneBody}>
                {followUpAsked
                  ? 'Done. Winback will check in about an hour from now.'
                  : 'That one counts, and it stays counted. Want a quick check-in in an hour, in case it comes back?'}
              </Text>
              {!followUpAsked && (
                <Pressable
                  style={styles.followUpButton}
                  onPress={askFollowUp}
                  accessibilityRole="button"
                  accessibilityHint="Sends one reminder in about an hour"
                >
                  <Text style={styles.followUpLabel}>Check in with me in an hour</Text>
                </Pressable>
              )}
              <EmberButton label="Close" onPress={() => close('past_it')} />
            </View>
          ) : (
            <EmberButton label="I'm past it" onPress={() => void pastIt()} />
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, paddingBottom: 28 },
  // Drawn above the headline (absolutely positioned) but read after it.
  closeRow: { position: 'absolute', top: 14, right: 26 },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 52 = the close button's row (14 + 32) plus the 6pt gap that sat below it.
  headlineBlock: { paddingTop: 52, paddingHorizontal: 32 },
  headline: {
    fontFamily: fonts.display.extrabold,
    fontSize: 27,
    lineHeight: 27 * 1.15,
    letterSpacing: tracking(27, -0.01),
    color: colors.text,
  },
  sub: {
    fontFamily: fonts.body.regular,
    fontSize: 14,
    lineHeight: 14 * 1.5,
    color: colors.textMuted,
    marginTop: 10,
  },
  segment: {
    flexDirection: 'row',
    gap: 6,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 4,
    marginHorizontal: spacing.screenX,
    marginTop: 20,
  },
  // A border marks the selected one, not only its colour.
  segBtn: {
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: 'transparent',
    alignItems: 'center',
  },
  segBtnActive: { backgroundColor: colors.surfaceWarm, borderColor: colors.accent },
  segLabel: { fontFamily: fonts.display.semibold, fontSize: 14, color: colors.textMuted },
  segLabelActive: { color: colors.accent },
  chips: { flexDirection: 'row', gap: 8, marginTop: 16, paddingHorizontal: spacing.screenX },
  chip: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.hairline,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  chipActive: { borderColor: colors.accent, backgroundColor: colors.surfaceWarm },
  chipName: { fontFamily: fonts.display.bold, fontSize: 14, color: colors.text },
  chipNameActive: { color: colors.accent },
  chipDetail: { fontFamily: fonts.body.regular, fontSize: 11, color: colors.textDim, marginTop: 2 },
  guideWrap: { alignItems: 'center', marginTop: 12 },
  // Wraps at large text sizes, so "Mute voice" drops to its own line instead
  // of being cut off past the edge (from about 1.6x).
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    columnGap: 16,
    rowGap: 4,
    marginTop: 10,
  },
  timer: {
    fontFamily: fonts.display.bold,
    fontSize: 15,
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  voiceToggle: {
    fontFamily: fonts.body.regular,
    fontSize: 12.5,
    color: colors.textFaint,
    textDecorationLine: 'underline',
  },
  voiceNote: {
    fontFamily: fonts.body.regular,
    fontSize: 11.5,
    color: colors.textFaint,
    textAlign: 'center',
    marginTop: 6,
  },
  card: {
    marginTop: 22,
    marginHorizontal: spacing.screenX,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 18,
    paddingVertical: 18,
    paddingHorizontal: 20,
  },
  reasons: {
    fontFamily: fonts.body.regular,
    fontSize: 15,
    lineHeight: 15 * 1.55,
    color: colors.text,
    marginTop: 10,
  },
  reasonsAccent: { fontFamily: fonts.body.semibold, color: colors.accent },
  ownReason: { fontSize: 15, lineHeight: 15 * 1.55, marginTop: 4 },
  goal: { fontFamily: fonts.body.regular, fontSize: 14, color: colors.textMuted, marginTop: 8 },
  goalStrong: { fontFamily: fonts.body.semibold, color: colors.text },
  // The shared row's metrics (HelplineRow), spaced for this screen.
  helplineSpacing: { marginTop: 12, marginBottom: 0, marginHorizontal: spacing.screenX },
  otherLinesLink: {
    fontFamily: fonts.body.regular,
    fontSize: 13,
    color: colors.textDim,
    textDecorationLine: 'underline',
    textAlign: 'center',
  },
  // A full 44pt target for the small text links.
  linkHit: { minHeight: 44, justifyContent: 'center', marginTop: 4 },
  blockButton: {
    marginTop: 14,
    borderWidth: 1.5,
    borderColor: colors.accent,
    borderRadius: spacing.radius,
    paddingVertical: 12,
    alignItems: 'center',
  },
  blockButtonLabel: { fontFamily: fonts.display.bold, fontSize: 15, color: colors.accent },
  footer: { marginTop: 'auto', paddingTop: 20, paddingHorizontal: spacing.screenX },
  doneCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 18,
    padding: 18,
    gap: 12,
  },
  doneTitle: { fontFamily: fonts.display.extrabold, fontSize: 20, color: colors.text },
  doneBody: {
    fontFamily: fonts.body.regular,
    fontSize: 14,
    lineHeight: 14 * 1.5,
    color: colors.textMuted,
  },
  followUpButton: {
    borderWidth: 1.5,
    borderColor: colors.accent,
    borderRadius: spacing.radius,
    paddingVertical: 14,
    alignItems: 'center',
  },
  followUpLabel: { fontFamily: fonts.display.bold, fontSize: 15, color: colors.accent },
});
