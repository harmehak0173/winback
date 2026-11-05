/**
 * Helplines: what a screen reader hears, and what a phone is shown. Both
 * decide whether someone in a crisis reaches help.
 */
const mockLocales = { list: [] as { regionCode: string | null }[] };
jest.mock('expo-localization', () => ({ getLocales: () => mockLocales.list }));

import { BY_REGION, HELPLINE_DIRECTORY, linesFor, pickRegion, SUPPORTED, type Helpline } from '@/lib/helplines-data';
import { helplineLabel } from '@/lib/helplines';

describe('spoken labels', () => {
  // A placeholder line: this copy ships no phone numbers.
  const call: Helpline = {
    name: 'Example Line · EXAMPLE',
    sub: 'Example region · free, confidential, 24/7',
    uri: 'tel:EXAMPLE',
    number: 'EXAMPLE',
  };

  it('says the action, name and number, then where, cost and hours', () => {
    expect(helplineLabel(call)).toBe('Call Example Line, EXAMPLE. Example region, free, confidential, 24/7');
  });

  it('keeps the separate Text button short', () => {
    expect(helplineLabel(call, 'text')).toBe('Text Example Line, EXAMPLE');
  });

  it('tells apart lines whose titles are the same', () => {
    const labels = [
      { ...call, sub: 'Region one · free, 24/7' },
      { ...call, sub: 'Region two · free, 24/7' },
    ].map((l) => helplineLabel(l));
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('never reads the middle dot aloud', () => {
    for (const l of [call, HELPLINE_DIRECTORY]) expect(helplineLabel(l)).not.toContain('·');
  });
});

describe('what a phone is shown', () => {
  it('ships no phone numbers', () => {
    for (const r of SUPPORTED) expect(BY_REGION[r]).toEqual([]);
  });

  it('shows the helpline directory in every region and on a phone it cannot place', () => {
    for (const r of SUPPORTED) expect(linesFor(r)).toEqual([HELPLINE_DIRECTORY]);
    expect(linesFor(null)).toEqual([HELPLINE_DIRECTORY]);
  });
});

describe('region', () => {
  it('picks the first supported region in the list', () => {
    expect(pickRegion(['BR', 'US'])).toBe('US');
    expect(pickRegion([null, 'ca'])).toBe('CA');
    expect(pickRegion(['BR'])).toBeNull();
  });

  // deviceRegion caches per launch, so each case loads a fresh copy - and the
  // Platform it reads is the one inside that same fresh registry.
  function deviceRegionOn(os: 'ios' | 'android', codes: (string | null)[]) {
    mockLocales.list = codes.map((regionCode) => ({ regionCode }));
    let region: string | null = null;
    jest.isolateModules(() => {
      const { Platform: IsolatedPlatform } = require('react-native') as typeof import('react-native');
      const replaced = jest.replaceProperty(IsolatedPlatform, 'OS', os);
      try {
        region = require('@/lib/helplines').deviceRegion();
      } finally {
        replaced.restore();
      }
    });
    return region;
  }

  it('on Android, places the phone by its first language with a country', () => {
    // pt-BR first, en-US second: Brazil, which we cannot place - not the US.
    expect(deviceRegionOn('android', ['BR', 'US'])).toBeNull();
    expect(deviceRegionOn('android', [null, 'CA', 'US'])).toBe('CA');
  });

  it('on iOS, every entry carries the phone region, so any supported one counts', () => {
    expect(deviceRegionOn('ios', ['US', 'US'])).toBe('US');
  });
});
