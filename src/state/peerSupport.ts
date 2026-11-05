import type { Region } from '@/lib/helplines-data';

/**
 * People who have been there: free meetings and forums run by groups that
 * already do peer support well, by the phone's region (the same region the
 * helplines use). Shown in You and in the comeback week. Winback does not run
 * a community of its own - moderating one is a safety job it cannot staff.
 *
 * Every link was opened in October 2026 and checked to belong to the group
 * named. Each row says only what that group's own pages say: "no dues or
 * fees" is Gamblers Anonymous's own wording, and only the SMART Recovery
 * finders that say "free" are called free. Finder pages only, never a
 * meeting's Zoom ID or dial-in number, which change.
 *
 * Never link gamblersanonymous.org.au or gamblersanonymous.org.nz: both
 * domains now belong to gambling sites. GA in Australia and New Zealand is
 * gaaustralia.org.au.
 */

export interface PeerGroup {
  name: string;
  /** What it is, in one short line. */
  what: string;
  url: string;
  /** The link's label. */
  label: string;
}

export const PEER_SUPPORT_AS_OF = 'Checked October 2026.';

const SMART_WHAT = 'Mutual-support meetings for any addiction, gambling included, online and in person.';

export const PEER_SUPPORT: Record<Region, PeerGroup[]> = {
  US: [
    {
      name: 'Gamblers Anonymous',
      what: 'Meetings in person, online and by phone. No dues or fees.',
      url: 'https://gamblersanonymous.org/find-a-meeting/',
      label: 'Find a meeting',
    },
    {
      name: 'SMART Recovery',
      what: 'Free mutual-support meetings for any addiction, gambling included, online and in person.',
      url: 'https://meetings.smartrecovery.org/meetings/',
      label: 'Find a meeting',
    },
  ],
  CA: [
    {
      name: 'Gamblers Anonymous',
      what: 'Meetings across Canada, in person and online. No dues or fees.',
      url: 'https://gamblersanonymous.org/international-meetings/',
      label: 'Find a meeting (choose Canada)',
    },
    {
      name: 'SMART Recovery Canada',
      what: 'Free mutual-support meetings for any addiction, gambling included, online and in person.',
      url: 'https://meetings.smartrecovery-canada.ca/meetings/',
      label: 'Find a meeting',
    },
  ],
  GB: [
    {
      name: 'GamCare forum',
      what: 'A peer forum, open day and night and moderated by trained staff. 18 and over.',
      url: 'https://community.gamcare.org.uk/',
      label: 'Open the forum',
    },
    {
      name: 'Gamblers Anonymous',
      what: 'Meetings in England, Wales and Ulster, online and in person.',
      url: 'https://gamblersanonymous.org.uk/online-meetings/',
      label: 'Find a meeting',
    },
    {
      name: 'Gamblers Anonymous Scotland',
      what: 'Meetings across Scotland. No fees.',
      url: 'https://ga-scotland.org/',
      label: 'Find a meeting',
    },
    {
      name: 'SMART Recovery UK',
      what: SMART_WHAT,
      url: 'https://smartrecovery.org.uk/meetings-online',
      label: 'Find a meeting',
    },
  ],
  IE: [
    {
      name: 'Gamblers Anonymous Ireland',
      what: 'Meetings across the island of Ireland, in person, on Zoom and by phone. No fees.',
      url: 'https://www.gamblersanonymous.ie/meetings',
      label: 'Find a meeting',
    },
  ],
  AU: [
    {
      name: 'Gamblers Anonymous',
      what: 'Meetings across Australia, including online ones. No dues or fees.',
      url: 'https://gaaustralia.org.au/meetings/',
      label: 'Find a meeting',
    },
    {
      name: 'SMART Recovery Australia',
      what: SMART_WHAT,
      url: 'https://au.meetings.smartrecovery.org/meetings/',
      label: 'Find a meeting',
    },
  ],
  NZ: [
    {
      // New Zealand's meetings are listed on the Australian site, split into
      // NZ North and NZ South.
      name: 'Gamblers Anonymous',
      what: 'Meetings in New Zealand, including one online. No dues or fees.',
      url: 'https://gaaustralia.org.au/meetings/',
      label: 'Find a meeting (pick NZ North or NZ South)',
    },
    {
      name: 'SMART Recovery Aotearoa',
      what: SMART_WHAT,
      url: 'https://au.meetings.smartrecovery.org/meetings/region/NZ/',
      label: 'Find a meeting',
    },
  ],
};

/** For a phone we cannot place: groups that meet by phone or online, worldwide. */
export const PEER_SUPPORT_FALLBACK: PeerGroup[] = [
  {
    name: 'Gamblers Anonymous',
    what: 'Phone meetings, with local numbers for 74 countries. No dues or fees.',
    url: 'https://gamblersanonymous.org/phone-meetings/',
    label: 'Find a phone meeting',
  },
  {
    name: 'SMART Recovery',
    what: 'Online meetings from around the world, shown in your own time zone.',
    url: 'https://meetings.smartrecoveryglobal.org/meetings/',
    label: 'Find a meeting',
  },
];

/** For the people close to you, anywhere: online meetings. */
export const GAM_ANON: PeerGroup = {
  name: 'Gam-Anon',
  what: 'For the family and friends of someone who gambles. Online meetings, no dues or fees.',
  url: 'https://www.gam-anon.org/meeting-directory/virtual-meetings',
  label: 'Find a meeting',
};
