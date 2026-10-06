import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Keeps a scroll container pinned to its newest content.
 *
 * Auto-scroll that fires on every update is hostile: reading back through a
 * long answer yanks you to the bottom mid-sentence. So this only auto-scrolls
 * while the user is *already* at the bottom, and exposes `isAtBottom` so the
 * caller can offer a "jump to latest" affordance once they have scrolled up.
 */

/** How close to the bottom still counts as "at the bottom", in pixels. */
const BOTTOM_THRESHOLD_PX = 80;

function isNearBottom(element) {
  // A zero-height container (e.g. jsdom, or an empty list) is trivially at the bottom.
  const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
  return distance <= BOTTOM_THRESHOLD_PX;
}

function prefersReducedMotion() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function scrollToBottom(element, behavior) {
  if (typeof element.scrollTo === 'function') {
    element.scrollTo({ top: element.scrollHeight, behavior });
    return;
  }
  // Fallback for environments without Element.prototype.scrollTo.
  element.scrollTop = element.scrollHeight;
}

/**
 * @param {unknown} contentDependency  Changing this re-evaluates the scroll position.
 * @returns {{ containerRef: object, isAtBottom: boolean, handleScroll: Function, scrollToLatest: Function }}
 */
export function useAutoScroll(contentDependency) {
  const containerRef = useRef(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  // Mirrors of state that the scroll effect needs, so the effect can stay keyed
  // on content alone instead of re-running on every scroll event.
  const isAtBottomRef = useRef(true);
  const hasMountedRef = useRef(false);

  const handleScroll = useCallback(() => {
    const element = containerRef.current;
    if (!element) return;

    const next = isNearBottom(element);
    isAtBottomRef.current = next;
    setIsAtBottom(next);
  }, []);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    if (!hasMountedRef.current) {
      // First paint should be already at the bottom, not animated there.
      hasMountedRef.current = true;
      scrollToBottom(element, 'auto');
      return;
    }

    if (!isAtBottomRef.current) return;

    scrollToBottom(element, prefersReducedMotion() ? 'auto' : 'smooth');
  }, [contentDependency]);

  const scrollToLatest = useCallback(() => {
    const element = containerRef.current;
    if (!element) return;

    scrollToBottom(element, prefersReducedMotion() ? 'auto' : 'smooth');
    isAtBottomRef.current = true;
    setIsAtBottom(true);
  }, []);

  return { containerRef, isAtBottom, handleScroll, scrollToLatest };
}