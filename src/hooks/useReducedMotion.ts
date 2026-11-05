import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * True when the user has asked the OS to reduce motion (iOS Reduce Motion,
 * Android "Remove animations"). Read once when the app starts and kept
 * current, so a screen opened after launch does not move for a moment before
 * it learns it should not.
 *
 * Honouring it means: no endless pulse or glow loops, counters jump straight
 * to their value, and anything that scales (the breathing circle) fades
 * instead. The information stays - only the movement goes.
 */
let known = false;
AccessibilityInfo.isReduceMotionEnabled()
  .then((on) => {
    known = on;
  })
  .catch(() => {});
AccessibilityInfo.addEventListener('reduceMotionChanged', (on) => {
  known = on;
});

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(known);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((on) => {
        if (alive) setReduced(on);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (on) => setReduced(on));
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  return reduced;
}
