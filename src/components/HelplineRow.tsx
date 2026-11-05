import React from 'react';
import {
  Pressable,
  type StyleProp,
  StyleSheet,
  Text,
  type TextStyle,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';
import { MessageIcon, PhoneIcon } from '@/components/icons';
import {
  canCallAndText,
  helplineHint,
  helplineLabel,
  helplineParts,
  isTextLine,
  openHelpline,
  type Helpline,
} from '@/lib/helplines';
import { colors, fonts } from '@/theme/tokens';

/**
 * A helpline's name, with its number on a line of its own that never wraps,
 * never split across two lines. The number is what gets read off and
 * dialled from another phone, so it is never split. At the largest text
 * sizes it shrinks to fit rather than wrapping.
 *
 * For rows with their own design (safety, the lock screen, the crash screen);
 * HelplineRow below uses it too.
 */
export function HelplineName({ line, style }: { line: Helpline; style?: StyleProp<TextStyle> }) {
  const { title, number } = helplineParts(line);
  // Each line ends in a space, invisible at the end of a line. Without it the
  // lines run together as text (the name and the number joined), so tools that check a
  // control's spoken name against its visible words (Label in Name, WCAG
  // 2.5.3) cannot match them.
  return (
    <>
      <Text style={style}>{title} </Text>
      {!!number && (
        <Text style={style} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
          {number}{' '}
        </Text>
      )}
    </>
  );
}

/**
 * One helpline row, the same on every screen that lists the lines (panic,
 * You, the slip flow, comeback week, lights out, the recap). The whole row
 * places the call (or opens the text, for a text-only line); lines that take
 * both get a separate Text button, so "call or text" is two real actions
 * rather than a promise one tap breaks. openHelpline never fails silently - a
 * device that cannot call shows the number to dial from another phone.
 *
 * `style` is for the row's outer spacing only. `compact` is for long lists
 * (Canada's provincial lines, or every line for a phone we cannot place; see
 * isLongList): a tighter row, still a full-size tap target, so the crisis
 * line under the list stays within reach.
 */
export function HelplineRow({
  line,
  style,
  compact = false,
}: {
  line: Helpline;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
}) {
  const texting = isTextLine(line);
  const both = canCallAndText(line);
  const web = line.uri.startsWith('https:');
  // At large text sizes the "Text" pill squeezed the number until it was cut
  // off. It drops under the call target instead, so the number gets the row.
  const { fontScale } = useWindowDimensions();
  const stack = both && fontScale >= 1.3;
  return (
    <View style={[styles.helpline, stack && styles.helplineStacked, style]}>
      <Pressable
        style={[styles.helplineMain, compact && styles.helplineMainCompact, stack && styles.helplineMainStacked]}
        onPress={() => void openHelpline(line)}
        accessibilityRole={web ? 'link' : 'button'}
        accessibilityLabel={helplineLabel(line)}
        // The number is already in the label; a link still says where it goes.
        accessibilityHint={web ? helplineHint(line) : undefined}
      >
        {texting ? <MessageIcon color={colors.accent} /> : <PhoneIcon color={colors.accent} />}
        <View style={styles.helplineText}>
          <HelplineName line={line} style={[styles.helplineTitle, compact && styles.helplineTitleCompact]} />
          <Text style={styles.helplineSub}>{line.sub}</Text>
        </View>
      </Pressable>
      {both && (
        <Pressable
          style={[styles.textButton, stack && styles.textButtonStacked]}
          onPress={() => void openHelpline(line, 'text')}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={helplineLabel(line, 'text')}
          accessibilityHint={helplineHint(line, 'text')}
        >
          <MessageIcon size={16} color={colors.accent} />
          <Text style={styles.textButtonLabel}>Text</Text>
        </Pressable>
      )}
    </View>
  );
}

/**
 * Row metrics, exported so a look-alike row (the panic screen's "Text your
 * person") lines up with the helplines under it.
 */
export const helplineRowStyles = StyleSheet.create({
  helpline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 16,
    paddingRight: 14,
    marginBottom: 10,
  },
  helplineMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 15,
    paddingLeft: 18,
    paddingRight: 6,
  },
  helplineText: { flex: 1 },
  helplineTitle: { fontFamily: fonts.display.bold, fontSize: 15, color: colors.text },
  helplineSub: { fontFamily: fonts.body.regular, fontSize: 12, color: colors.textDim, marginTop: 2 },
});

const styles = StyleSheet.create({
  ...helplineRowStyles,
  textButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  textButtonLabel: { fontFamily: fonts.display.bold, fontSize: 13, color: colors.accent },
  // Still at least 44pt tall with the title, number and sub lines.
  helplineMainCompact: { paddingVertical: 9, gap: 12 },
  helplineTitleCompact: { fontSize: 14 },
  helplineStacked: { flexWrap: 'wrap' },
  helplineMainStacked: { flexBasis: '100%' },
  textButtonStacked: { marginLeft: 18, marginBottom: 12 },
});
