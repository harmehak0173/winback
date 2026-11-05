/**
 * Instrument design system tokens (from the Claude Design handoff).
 * Near-black, one ember accent per view, precision-instrument data display.
 *
 * Every token that is ever used for text meets WCAG AA (4.5:1) for small text
 * on `bg` (#0A0B0D), and all but `finePrint` also meet it on `surface`.
 * Measured ratios on bg / surface:
 *   textMuted 6.06 / 5.62, textDim 5.37 / 4.98, textFaint 4.95 / 4.59,
 *   finePrint 4.68 / 4.34, accentDim 5.06 / 4.69, accent 8.40 / 7.79.
 * The handoff's original greys (textFaint #5c626b at 3.20:1, finePrint
 * #4d525a at 2.50:1) were too dim for the subscription terms, the consent
 * line and the tab labels that use them. The hierarchy is kept - each step
 * is still visibly quieter than the one above it - just lifted to legible.
 */
export const colors = {
  bg: '#0A0B0D',
  bgDeep: '#050506',
  surface: '#131519',
  surfaceWarm: '#1a120b',
  surfaceWarmBorder: '#3a2413',
  hairline: '#20242B',
  hairlineDim: '#191C22',
  accent: '#FF8A3D',
  accentDim: '#A07A50',
  text: '#F2F3F5',
  textMuted: '#8A8F98',
  textDim: '#80868F',
  textFaint: '#7A8089',
  onAccent: '#0b0b0d',
  notice: '#d8a984',
  /** Bg only: 4.34:1 on surface, so never use it for text on a card. */
  finePrint: '#767C85',
} as const;

export const fonts = {
  /** Archivo - display, numerals, headings, buttons, wordmark */
  display: {
    medium: 'Archivo_500Medium',
    semibold: 'Archivo_600SemiBold',
    bold: 'Archivo_700Bold',
    extrabold: 'Archivo_800ExtraBold',
    black: 'Archivo_900Black',
  },
  /** Hanken Grotesk - body copy, labels, option text, captions */
  body: {
    regular: 'HankenGrotesk_400Regular',
    medium: 'HankenGrotesk_500Medium',
    semibold: 'HankenGrotesk_600SemiBold',
  },
} as const;

export const spacing = {
  /** Default screen horizontal padding */
  screenX: 26,
  /** Emotional / reveal screens */
  screenXWide: 30,
  cardGap: 12,
  radius: 16,
  radiusHero: 20,
} as const;

/** Tight display tracking: -0.02em expressed in px for a given font size. */
export const tracking = (fontSize: number, em = -0.02) => fontSize * em;
