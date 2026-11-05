import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * True while VoiceOver or TalkBack is on. Read once when the app starts and
 * kept current, so a screen opened after launch starts with the right answer
 * instead of a moment of "off" (which used to let the panic voice start
 * talking over the screen reader).
 *
 * Anything that moves on by itself (an auto-advancing question, a timed
 * screen) waits for a tap while it is on: moving on would pull the page out
 * from under someone still reading it.
 */
let known = false;
AccessibilityInfo.isScreenReaderEnabled()
  .then((on) => {
    known = on;
  })
  .catch(() => {});
AccessibilityInfo.addEventListener('screenReaderChanged', (on) => {
  known = on;
});

export function useScreenReader(): boolean {
  const [on, setOn] = useState(known);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isScreenReaderEnabled()
      .then((enabled) => {
        if (alive) setOn(enabled);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', (enabled) => setOn(enabled));
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  return on;
}
