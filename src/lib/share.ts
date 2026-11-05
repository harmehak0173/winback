import { Platform } from 'react-native';

/**
 * Where a shared progress message points: the site's landing page (the root
 * of the hosted site the support page lives on), else the Play listing on
 * Android. A share reaches someone who has never heard of Winback, so it
 * opens on what the app is and where to get it, not on the support page.
 * iOS has no listing URL until the app has an App Store id, and a share with
 * no link is fine.
 */
const SUPPORT_URL = process.env.EXPO_PUBLIC_SUPPORT_URL;
/** The folder the support page sits in: https://host/support.html -> https://host/. */
const siteRoot = (url: string) =>
  url.replace(/^https:\/\/[^/]+/, '') ? url.replace(/[^/]*$/, '') : `${url}/`;
export const SHARE_LINK: string | null =
  SUPPORT_URL && SUPPORT_URL.startsWith('https://')
    ? siteRoot(SUPPORT_URL)
    : Platform.OS === 'android'
      ? 'https://play.google.com/store/apps/details?id=com.winback.app'
      : null;

/**
 * The text of a progress share: the caller's sentence, the name, and the
 * link when there is one. Never a money amount - a share goes to other
 * people's phones, and an amount says more than the person may mean to.
 */
export function shareMessage(body: string): string {
  return `${body} Winback.${SHARE_LINK ? ` ${SHARE_LINK}` : ''}`;
}
