import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Eyebrow } from '@/components/Eyebrow';
import {
  deviceRegion,
  helplineHint,
  openHelpline,
  useRegionKnown,
  type Helpline,
  type Region,
} from '@/lib/helplines';
import { SUPPORTED } from '@/lib/helplines-data';
import { GAM_ANON, PEER_SUPPORT, PEER_SUPPORT_AS_OF, PEER_SUPPORT_FALLBACK } from '@/state/peerSupport';
import {
  BANK_BLOCKS,
  SELF_EXCLUSION,
  SELF_EXCLUSION_AS_OF,
  SELF_EXCLUSION_FALLBACK,
  type ExclusionProgram,
  type RegionGuide,
} from '@/state/selfExclusion';
import { colors, fonts } from '@/theme/tokens';

/**
 * The self-exclusion programs for this phone's region, under the
 * self-exclusion play and the "Self-exclude" cut-the-lines task. Same region
 * as the helplines, and the same web rule: nothing region-specific renders
 * until useRegionKnown is true, so a pre-rendered page never shows the build
 * machine's country first.
 *
 * Region detection can be wrong (a Canadian phone set to the US), so the
 * other places are one tap away, as they are for the helplines.
 */
export function SelfExclusionGuide() {
  const regionKnown = useRegionKnown();
  const [showOthers, setShowOthers] = useState(false);
  if (!regionKnown) return null;
  const region = deviceRegion();
  const guide = region ? SELF_EXCLUSION[region] : SELF_EXCLUSION_FALLBACK;
  const others = SUPPORTED.filter((r) => r !== region);

  return (
    <View style={styles.wrap}>
      <GuideBlock guide={guide} label={region ? `In ${guide.place}` : 'Where you are'} />
      {guide.programs.length > 0 && <Text style={styles.asOf}>{SELF_EXCLUSION_AS_OF}</Text>}
      <Pressable
        onPress={() => setShowOthers((v) => !v)}
        hitSlop={8}
        style={styles.toggle}
        accessibilityRole="button"
        aria-expanded={showOthers}
      >
        <Text style={styles.toggleLabel}>{showOthers ? 'Hide other places' : 'Somewhere else? Other places'}</Text>
      </Pressable>
      {showOthers &&
        others.map((r: Region) => (
          <GuideBlock key={r} guide={SELF_EXCLUSION[r]} label={`In ${SELF_EXCLUSION[r].place}`} />
        ))}
    </View>
  );
}

/**
 * The bank gambling blocks this region's banks offer, under the lock play and
 * the bank-block task. Renders nothing where we have not confirmed a block
 * from a bank's own page: the generic "search your banking app" advice
 * already covers those places.
 */
export function BankBlockNote() {
  const regionKnown = useRegionKnown();
  if (!regionKnown) return null;
  const region = deviceRegion();
  const note = region ? BANK_BLOCKS[region] : undefined;
  if (!region || !note) return null;
  return (
    <View style={styles.wrap}>
      <Eyebrow>{`In ${SELF_EXCLUSION[region].place}`}</Eyebrow>
      <Text style={styles.line}>{note}</Text>
    </View>
  );
}

/**
 * Peer support for this region (state/peerSupport.ts), in You and the
 * comeback week. Same region rule as the helplines; a phone we cannot place
 * gets the groups that meet by phone or online. `family` adds Gam-Anon, for
 * the people close to the user.
 */
export function PeerSupportGuide({ family = false }: { family?: boolean }) {
  const regionKnown = useRegionKnown();
  if (!regionKnown) return null;
  const region = deviceRegion();
  const groups = [...(region ? PEER_SUPPORT[region] : PEER_SUPPORT_FALLBACK), ...(family ? [GAM_ANON] : [])];
  return (
    <View>
      {groups.map((g) => (
        <View key={g.name + g.url} style={styles.program}>
          <Text style={styles.name} accessibilityRole="header">
            {g.name}
          </Text>
          <Text style={styles.line}>{g.what}</Text>
          <LinkRow
            line={{ name: g.name, sub: '', uri: g.url, number: typeable(g.url) }}
            label={g.label}
            program={g.name}
          />
        </View>
      ))}
      <Text style={styles.asOf}>{PEER_SUPPORT_AS_OF}</Text>
    </View>
  );
}

function GuideBlock({ guide, label }: { guide: RegionGuide; label: string }) {
  return (
    <View style={styles.block}>
      <Eyebrow>{label}</Eyebrow>
      {!!guide.intro && <Text style={styles.line}>{guide.intro}</Text>}
      {guide.programs.map((p) => (
        <ProgramRow key={p.name} program={p} />
      ))}
      {!!guide.note && <Text style={styles.line}>{guide.note}</Text>}
    </View>
  );
}

/** The address without its scheme: what an alert says to type in. */
const typeable = (url: string) => url.replace(/^https?:\/\//, '').replace(/\/$/, '');

function ProgramRow({ program }: { program: ExclusionProgram }) {
  return (
    <View style={styles.program}>
      {/* A heading, so a screen reader can move from program to program. */}
      <Text style={styles.name} accessibilityRole="header">
        {program.name}
      </Text>
      <Text style={styles.line}>{program.covers}</Text>
      {!!program.notCovered && <Text style={styles.line}>Not covered: {program.notCovered}</Text>}
      {!!program.periods && <Text style={styles.line}>How long: {program.periods}</Text>}
      {!!program.call && (
        <LinkRow
          line={{ name: program.name, sub: '', uri: program.call.uri, number: program.call.number }}
          label={program.call.label}
          program={program.name}
        />
      )}
      {!!program.link && (
        <LinkRow
          line={{ name: program.name, sub: '', uri: program.link.url, number: typeable(program.link.url) }}
          label={program.link.label}
          program={program.name}
        />
      )}
    </View>
  );
}

/**
 * Opens through openHelpline, which never fails silently: if the browser
 * cannot open the page, an alert gives the full address to type in, and if
 * the device cannot call, the number to call from another phone. Read out
 * with its program's name, so a list of links still says whose each one is.
 */
function LinkRow({ line, label, program }: { line: Helpline; label: string; program: string }) {
  const call = line.uri.startsWith('tel:');
  return (
    <Pressable
      onPress={() => void openHelpline(line)}
      hitSlop={6}
      style={styles.linkHit}
      accessibilityRole={call ? 'button' : 'link'}
      accessibilityLabel={`${label}, ${program}`}
      accessibilityHint={call ? helplineHint(line) : 'Opens in your browser'}
    >
      <Text style={styles.link}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 14 },
  block: { marginBottom: 6 },
  program: { marginTop: 10 },
  name: { fontFamily: fonts.display.bold, fontSize: 14, color: colors.text },
  line: { fontFamily: fonts.body.regular, fontSize: 13.5, lineHeight: 13.5 * 1.5, color: colors.textMuted, marginTop: 4 },
  linkHit: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  link: { fontFamily: fonts.display.bold, fontSize: 13.5, color: colors.accent, textDecorationLine: 'underline' },
  asOf: { fontFamily: fonts.body.regular, fontSize: 12, color: colors.textFaint, marginTop: 6 },
  toggle: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  toggleLabel: { fontFamily: fonts.body.medium, fontSize: 13, color: colors.textMuted, textDecorationLine: 'underline' },
});
