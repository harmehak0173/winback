/**
 * Breathing patterns for the panic screen. Three widely taught paced-breathing
 * patterns; the app makes no physiological claims about them, it just keeps
 * the time:
 *  - Calm (in 4 / out 6): an exhale longer than the inhale. The gentlest
 *    option, and the default for an acute urge.
 *  - 4-7-8 (popularised by Dr. Andrew Weil): a long hold and a longer exhale.
 *  - Box (4-4-4-4): steady and even.
 * The old single mode was a 6s cycle - too quick to follow comfortably.
 */
export type PhaseKind = 'in' | 'hold' | 'out';

export interface Phase {
  kind: PhaseKind;
  /** Spoken + shown label. */
  label: string;
  seconds: number;
}

export interface BreathPattern {
  id: 'calm' | '478' | 'box';
  name: string;
  detail: string;
  phases: Phase[];
}

export const PATTERNS: BreathPattern[] = [
  {
    id: 'calm',
    name: 'Calm',
    detail: 'In 4 · out 6',
    phases: [
      { kind: 'in', label: 'Breathe in', seconds: 4 },
      { kind: 'out', label: 'Breathe out', seconds: 6 },
    ],
  },
  {
    id: '478',
    name: '4 · 7 · 8',
    detail: 'Deep calm',
    phases: [
      { kind: 'in', label: 'Breathe in', seconds: 4 },
      { kind: 'hold', label: 'Hold', seconds: 7 },
      { kind: 'out', label: 'Breathe out', seconds: 8 },
    ],
  },
  {
    id: 'box',
    name: 'Box',
    detail: '4 · 4 · 4 · 4',
    phases: [
      { kind: 'in', label: 'Breathe in', seconds: 4 },
      { kind: 'hold', label: 'Hold', seconds: 4 },
      { kind: 'out', label: 'Breathe out', seconds: 4 },
      { kind: 'hold', label: 'Hold', seconds: 4 },
    ],
  },
];

/** 5-4-3-2-1 grounding: name senses to pull attention out of the craving. */
export interface GroundStep {
  count: number;
  sense: string;
  prompt: string;
}

export const GROUNDING: GroundStep[] = [
  { count: 5, sense: 'see', prompt: 'Look around. Name 5 things you can see.' },
  { count: 4, sense: 'feel', prompt: 'Notice 4 things you can feel - your feet, the chair, your phone.' },
  { count: 3, sense: 'hear', prompt: 'Listen for 3 things you can hear.' },
  { count: 2, sense: 'smell', prompt: 'Find 2 things you can smell.' },
  { count: 1, sense: 'taste', prompt: 'Notice 1 thing you can taste.' },
];
