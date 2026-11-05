import { Platform } from 'react-native';
import { openHelpline } from './helplines';

/**
 * One-tap texts to the accountability partner.
 *
 * Always started by the user and never sent automatically: this only opens
 * the Messages app with the text filled in, and the user presses send. The
 * partner's number never leaves the device.
 *
 * Goes through openHelpline, so a device that cannot text (an iPad, a Wi-Fi
 * tablet) shows the number instead of failing silently.
 */

export interface Partner {
  name: string;
  phone: string;
}

/** Digits and a leading +, or '' when there is nothing dialable. */
export function partnerDialable(partner: Partner): string {
  return partner.phone.replace(/[^\d+]/g, '');
}

/** Open a prefilled SMS to the partner. Resolves false when there is no usable number. */
export async function smsPartner(partner: Partner | null, body: string): Promise<boolean> {
  if (!partner) return false;
  const dialable = partnerDialable(partner);
  if (!dialable) return false;
  // iOS reads the body after '&', Android after '?'.
  const sep = Platform.OS === 'ios' ? '&' : '?';
  await openHelpline({
    name: `Text ${partner.name}`,
    sub: '',
    uri: `sms:${dialable}${sep}body=${encodeURIComponent(body)}`,
    number: partner.phone,
  });
  return true;
}

/** The panic screen's text: short, and asks for one thing. */
export const URGE_TEXT = 'Riding out an urge right now. Can you talk for a minute?';

/**
 * For the moment someone is about to switch off a blocker or self-exclusion:
 * it says plainly what is happening, and hands the partner the one job of
 * talking them out of it.
 */
export const BLOCK_TEXT = "I'm about to switch off my gambling block. Can you talk me out of it?";
