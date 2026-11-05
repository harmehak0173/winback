import type { Region } from '@/lib/helplines-data';

/**
 * Where to self-exclude, and which banks can block gambling, by the phone's
 * region (the same region the helplines use, from deviceRegion()). Shown
 * under the 'self-exclusion' and 'block-the-apps' plays and the
 * 'self-exclude' and 'bank-block' cut-the-lines tasks.
 *
 * Read in a hard moment, so every program is the same four short lines: what
 * it covers, what it does not, how long, and where. Only what an official page
 * says goes in; where a detail could not be confirmed it is left out rather
 * than guessed (no periods for TAB NZ or for My PlayBreak's early ending, and
 * no named banks in the US, Canada or Ireland).
 *
 * As of October 2026. Sources, all seen 2026-10-05:
 *   US  responsibleplay.pa.gov, gamingcontrolboard.pa.gov (Pennsylvania, the
 *       one state program checked; the copy stays general for that reason)
 *   CA  Ontario: betguard.ca/gp/en/faq/ and igamingontario.ca/en/news/
 *       betguard-centralized-self-exclusion-ontario-igaming (launched
 *       2026-05-14); olg.ca/en/my-play-break.html (casinos and charitable
 *       gaming centres). BC: playnow.com/gamesense/game-break-program.html
 *       (content in playnow.com/resources/json/game-break-program/
 *       game-break-program.json) and playnow.com/gamesense/manage-your-play-
 *       online.html. Alberta: aglc.ca/igaming, alberta.ca/albertas-igaming-
 *       strategy (open market since 2026-07-13), selfexclusion.ca and the
 *       AGLC brochure gamesenseab.ca/sites/gamesense/files/2026-02/
 *       Self-ExclusionBrochure2026.pdf. Saskatchewan: playnow.com/sk/
 *       gamesense/voluntary-self-exclusion.html. Manitoba: playnow.com/mb/
 *       gamesense/voluntary-self-exclusion.html, mbll.ca/content/concerned-
 *       about-your-gambling and the MBLL brochure of July 2026. Quebec:
 *       bienjouer.lotoquebec.com/en/self-exclusion/online-gambling/ and
 *       /fr/autoexclusion/etablissement/ (the live site blocks automated
 *       reads; read through archived copies of 2025-11 to 2026-06).
 *       Atlantic: alc.ca/content/alc/en/corporate/playwise/player-
 *       tools.html. Territories: wclc.com and responsiblegambling.org (no
 *       territorial program found; no government page says either way)
 *   AU  betstop.gov.au (home, faqs, about, terms-of-use, support-tools,
 *       what-to-expect); gamblinghelponline.org.au (venue exclusion is run by
 *       each state); acma.gov.au/credit-ban (binds licensed operators only);
 *       bank pages: commbank.com.au/support/gambling-support.html,
 *       nab.com.au/personal/customer-support/gambling-restriction,
 *       anz.com.au/plus/support/card/card-controls/gambling-block/,
 *       westpac.com.au/personal-banking/credit-cards/manage/gambling-
 *       preference/
 *   NZ  help.tab.co.nz/s/article/Self-Exclusion-options (it refuses
 *       automated reads, so no TAB periods are shown and the not-covered line
 *       rests on TAB's indexed text, until someone has confirmed them on the
 *       page in a browser); dia.govt.nz (venue exclusion orders, up to 2
 *       years, and the Online Casino Gambling Act 2026: no national online
 *       register yet); multivenueexclusion.org.nz; safergambling.org.nz/
 *       taking-action/staying-in-control (bank list); anz.co.nz/personal/
 *       credit-cards/manage/card-settings/; kiwibank.co.nz/help/cards/
 *       manage-a-card/block-gambling-transactions/ and westpac.co.nz/help/
 *       how-can-i-control-gambling-transactions-with-digital-banking/ (read
 *       through indexed text)
 *   GB  gamstop.co.uk, gamstop.co.uk/about, gamstop.co.uk/corporate/history
 *       (Gamstop Betting Shops, formerly MOSES, renamed November 2025);
 *       self-exclusion.co.uk; bank pages: natwest.com/support-centre/
 *       banking-from-home/how-to-use-the-mobile-app/what-is-the-gambling-
 *       control-feature.html, starlingbank.com/blog/48h-reactivation-delay-
 *       on-gambling-merchant-block/, monzo.com/help/account-and-profile/
 *       gambling-spending-block-how-to
 *   IE  grai.ie/gambling-safety/protecting-the-public/players-safety (the
 *       National Gambling Exclusion Register has not started). The regulator
 *       lists bank blocks (grai.ie/gambling-safety/get-support/protection-
 *       tools), but no bank's own page has been checked, so none is named.
 * Review every release, like the platform steps in cutLines.ts.
 */

export interface ExclusionProgram {
  /** Program name, with its province or state when that is the scope. */
  name: string;
  covers: string;
  /** What it does not cover, when an official page says. */
  notCovered?: string;
  /** Shortest to longest period, and whether it can be ended early. */
  periods?: string;
  /** Opened in the browser; `label` is what is shown and read out. */
  link?: { url: string; label: string };
  /**
   * A number to call. `label` is shown and read out; `number` is the plain
   * form an alert gives when this device cannot make calls.
   */
  call?: { uri: string; number: string; label: string };
}

export interface RegionGuide {
  /** "Australia", "Canada": shown as "In <place>". */
  place: string;
  /** One line before the programs, when the region needs it. */
  intro?: string;
  programs: ExclusionProgram[];
  /** One line after the programs. */
  note?: string;
}

export const SELF_EXCLUSION_AS_OF = 'Checked October 2026. Programs change, so check the official page.';

export const SELF_EXCLUSION: Record<Region, RegionGuide> = {
  US: {
    place: 'the United States',
    programs: [
      {
        name: "Your state's self-exclusion program",
        covers:
          'Betting companies licensed in that state. Some states keep separate lists for casinos, online gaming and sports betting, so you may need more than one.',
        notCovered: 'Other states, and offshore or unlicensed sites.',
        periods: 'Set by each state, often 1 year, 5 years or lifetime. Some lifetime bans cannot be lifted.',
      },
    ],
    note: 'Search for your state\'s gaming commission and "self-exclusion", or use "Responsible gaming" in each betting app.',
  },
  CA: {
    place: 'Canada',
    intro: 'Each province runs its own program. Find yours:',
    programs: [
      {
        name: 'Ontario: BetGuard',
        covers: 'Every regulated online gambling site in Ontario at once, including OLG.',
        notCovered:
          "Casinos and other in-person gambling, and unregulated sites. For Ontario casinos and charitable gaming centres, use OLG's My PlayBreak.",
        periods:
          '6 months to 5 years (6 months, 1 year, 5 years or a length you choose). It cannot be shortened. Use only betguard.ca.',
        // No-break hyphens, so the number never wraps mid-number.
        link: { url: 'https://www.betguard.ca/gp/en/', label: 'betguard.ca' },
      },
      {
        name: 'Ontario: OLG My PlayBreak',
        covers:
          'Every Ontario casino, or every charitable gaming centre, and your OLG.ca account. You can also take a break from OLG.ca alone.',
        periods: 'For casinos and gaming centres: 3 months, 6 months, or 1, 2, 3, 4 or 5 years. For OLG.ca alone: 1 day to 5 years.',
        link: { url: 'https://www.olg.ca/en/my-play-break.html', label: 'olg.ca' },
      },
      {
        name: 'British Columbia: Game Break',
        covers:
          'Your PlayNow account and BCLC apps, and every BC gambling facility: casinos, community gaming centres and race track gaming floors.',
        periods: '6 months, 1, 2 or 3 years. It cannot be ended early.',
        link: { url: 'https://www.playnow.com/gamesense/game-break-program.html', label: 'playnow.com' },
      },
      {
        name: 'Alberta: AGLC Self-Exclusion Program',
        covers:
          'Every registered online gambling site in Alberta at once, including PlayAlberta, or casinos and racing entertainment centres, or both. You choose.',
        notCovered: 'Lottery tickets bought in stores, and unregulated sites.',
        periods: '6 months, 1, 2 or 3 years. It cannot be ended early.',
        link: { url: 'https://www.selfexclusion.ca/', label: 'selfexclusion.ca' },
      },
      {
        name: 'Saskatchewan: PlayNow self-exclusion',
        covers: 'Your PlayNow Saskatchewan account.',
        periods: '6 months to 5 years. It cannot be ended early.',
        link: { url: 'https://www.playnow.com/sk/gamesense/voluntary-self-exclusion.html', label: 'playnow.com/sk' },
      },
      {
        name: 'Manitoba: Voluntary Self-Exclusion',
        covers:
          'Your PlayNow Manitoba account. For Club Regent, McPhillips Station and Shark Club, sign up in person at the casino, or call to book an appointment somewhere else. Signing up at a casino also closes your PlayNow account.',
        // The Manitoba Liquor & Lotteries Security Programs office. It books
        // the appointment and answers questions; you do not sign up by phone.
        periods:
          'At least 6 months, 1, 2 or 3 years. It cannot be ended early, and it stays on until you complete the Pause and Plan course and ask in writing to end it.',
        link: { url: 'https://www.playnow.com/mb/gamesense/voluntary-self-exclusion.html', label: 'playnow.com/mb' },
      },
      {
        name: 'Quebec: Loto-Québec online autoexclusion',
        covers: 'Your lotoquebec.com account, including online Mise-o-jeu+ betting.',
        notCovered: 'Bets at lottery retailers, and unregulated sites.',
        periods: '3 months to 5 years. It cannot be ended early.',
        link: { url: 'https://bienjouer.lotoquebec.com/fr/autoexclusion', label: 'bienjouer.lotoquebec.com' },
      },
      {
        name: 'Quebec: casinos and gaming halls',
        covers: "Loto-Québec's casinos and gaming halls, signed up for in person. It also blocks your lotoquebec.com account.",
        periods: '3 months to 5 years. It cannot be ended early.',
        link: {
          url: 'https://bienjouer.lotoquebec.com/fr/autoexclusion/etablissement/',
          label: 'bienjouer.lotoquebec.com',
        },
      },
      {
        name: 'Atlantic provinces: Take a Break',
        covers: 'Your alc.ca account, including online PRO-LINE.',
        notCovered: 'Tickets bought in stores, casinos, and unregulated sites.',
        periods: '1 to 90 days, or 6, 12, 24 or 36 months. Either kind of break cannot be reversed.',
        link: {
          url: 'https://www.alc.ca/content/alc/en/corporate/playwise/player-tools.html',
          label: 'alc.ca',
        },
      },
    ],
    note: "We found no program run by the territories, so there, use each company's own settings. None of these programs covers unregulated sites.",
  },
  AU: {
    place: 'Australia',
    programs: [
      {
        name: 'BetStop, the National Self-Exclusion Register',
        covers:
          'Every licensed online and phone betting company in Australia, in one go. They must close your accounts, refuse new ones and stop marketing to you. Free, about 5 minutes, with ID.',
        notCovered: 'Betting in person (pubs, clubs, casinos, pokies), and offshore sites.',
        periods:
          '3 months to a lifetime. You can extend it at any time. After at least 3 months you can apply to end it early: you must make a statutory declaration that you have seen a counsellor or GP about it, and you come off the register 7 days later. You can withdraw the request during those 7 days.',
        // For ID that cannot be checked online.
        link: { url: 'https://www.betstop.gov.au/', label: 'betstop.gov.au' },
      },
      {
        name: 'Venue self-exclusion',
        covers: 'Pubs, clubs, casinos and TAB outlets. Each state runs its own: ask staff at the venue, or call Gambling Help.',
        // No-break spaces, so the number never wraps mid-number.
        periods: 'Varies by state.',
      },
    ],
  },
  NZ: {
    place: 'New Zealand',
    programs: [
      {
        name: 'TAB NZ self-exclusion',
        covers: 'Your TAB account, the only legal sports and race betting in New Zealand.',
        notCovered:
          "Betting in person at TAB venues (use TAB's venue exclusion), pokies in pubs and clubs, casinos, Lotto and offshore sites.",
        link: { url: 'https://help.tab.co.nz/s/article/Self-Exclusion-options', label: 'help.tab.co.nz' },
      },
      {
        name: 'Venue exclusion',
        covers:
          'The pokie area of a pub or club, or a casino. Ask the manager: by law they must exclude you. Multi-Venue Exclusion covers several pokie venues at once.',
        periods: 'Up to 2 years.',
        link: { url: 'https://www.multivenueexclusion.org.nz/', label: 'multivenueexclusion.org.nz' },
      },
    ],
    note: 'There is no national register for online casinos yet. Use each site\'s own settings and a blocker.',
  },
  GB: {
    place: 'Great Britain',
    programs: [
      {
        name: 'Gamstop Online (GAMSTOP)',
        covers: 'Every gambling site and app licensed in Great Britain. Free.',
        notCovered:
          'Gambling in person, such as betting shops, casinos and arcades (Gamstop Betting Shops, below, covers betting shops), and sites not licensed in Great Britain.',
        periods: '6 months, 1 year or 5 years. It cannot be cancelled early, and stays on until you ask to remove it.',
        link: { url: 'https://www.gamstop.co.uk/', label: 'gamstop.co.uk' },
      },
      {
        name: 'Gamstop Betting Shops',
        covers: 'Many high street bookmakers in Great Britain, in person. Free, and you sign up by phone. It used to be called MOSES.',
        periods: '12 months.',
        link: { url: 'https://self-exclusion.co.uk/', label: 'self-exclusion.co.uk' },
      },
    ],
  },
  IE: {
    place: 'Ireland',
    programs: [
      {
        name: 'National Gambling Exclusion Register',
        covers: 'Planned by the Gambling Regulatory Authority of Ireland, but not open yet.',
        link: {
          url: 'https://www.grai.ie/gambling-safety/protecting-the-public/players-safety',
          label: 'grai.ie',
        },
      },
    ],
    note: 'Until it opens, use "Responsible gambling" in each betting app.',
  },
};

/** For a phone we cannot place in a region we have checked. */
export const SELF_EXCLUSION_FALLBACK: RegionGuide = {
  place: 'your country',
  programs: [],
  note: 'Use "Responsible gaming" in each betting app, and check whether your country or state runs one register that covers every licensed company at once.',
};

/**
 * Bank gambling blocks, only where a bank's own page confirms one. Elsewhere
 * the generic advice in the play and the cut-the-lines task stands: search
 * the banking app for "gambling", or ask the bank. Menu paths move, so this
 * names the setting, not the path.
 */
export const BANK_BLOCKS: Partial<Record<Region, string>> = {
  AU: 'CommBank, NAB, ANZ Plus and Westpac each have a gambling block in their app or online banking, in the card settings. Turning it off is not instant: 48 hours with CommBank and ANZ Plus, 72 hours with NAB, and up to 2 business days with Westpac. Since June 2024, betting companies cannot take credit cards or crypto. Illegal offshore sites ignore this, so block your credit cards too.',
  NZ: 'ANZ (in goMoney, card settings), Westpac and Kiwibank each offer a gambling block. Lifting it is not instant: 48 hours with ANZ, two days with Westpac, and up to two working days with Kiwibank.',
  GB: 'NatWest, Starling and Monzo each have a gambling block in their app. Turning it off takes 2 days or more.',
};
