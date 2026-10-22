// Screen layouts and input style. The CSS uses the same media queries (see the
// "Compact layouts" section of styles.css): keep the two in step.
import { useSyncExternalStore } from 'react';

/**
 * The full desktop HUD, or one of two compact layouts for phones and small tablets:
 * - portrait: narrow screens. Two-row top bar, tab bar at the bottom, a bottom sheet for the selection.
 * - landscape: short screens (a phone on its side). One-row top bar, slim tab bar at the bottom, a side sheet.
 */
export type Layout = 'desktop' | 'portrait' | 'landscape';

export const LANDSCAPE_QUERY = '(max-height: 520px)';
export const PORTRAIT_QUERY = '(max-width: 900px) and (min-height: 521px)';
/** No hover and a coarse pointer: a touch screen is the main input. */
export const TOUCH_QUERY = '(hover: none) and (pointer: coarse)';

function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const mq = window.matchMedia(query);
      mq.addEventListener('change', notify);
      return () => mq.removeEventListener('change', notify);
    },
    () => window.matchMedia(query).matches,
  );
}

export function useLayout(): Layout {
  const landscape = useMedia(LANDSCAPE_QUERY);
  const portrait = useMedia(PORTRAIT_QUERY);
  return landscape ? 'landscape' : portrait ? 'portrait' : 'desktop';
}

export function useTouch(): boolean {
  return useMedia(TOUCH_QUERY);
}
