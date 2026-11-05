import { useEffect, useSyncExternalStore } from 'react';

/**
 * Whether an in-screen RN <Modal> (the milestone celebration, the quick urge
 * sheet) is showing, so the notification router can wait for it.
 *
 * A tapped reminder pushes a native-stack modal. On iOS, react-native-screens
 * dismisses any view controller it did not present before presenting its own,
 * so a reminder opened over the celebration closed it natively without its
 * onDismiss: the milestone was never marked seen, the RN Modal stayed
 * "visible" in JS with no view behind it, and Home kept holding back the
 * paywall and the reminders prompt behind a celebration nobody could see.
 * Routing now waits until every such overlay has closed.
 */
let open = 0;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

const snapshot = () => open > 0;

/** True while any overlay registered with useOverlayHold is showing. */
export function useOverlayOpen(): boolean {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** Register an overlay as showing while `active` is true (and it is mounted). */
export function useOverlayHold(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    open += 1;
    emit();
    return () => {
      open -= 1;
      emit();
    };
  }, [active]);
}
