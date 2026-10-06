import { useEffect, useState } from 'react';

/**
 * Subscribes to a CSS media query.
 *
 * Only used for behaviour that CSS cannot express — currently, closing the
 * mobile drawer when the viewport grows past the breakpoint. The layout itself
 * is done in CSS so there is no first-paint mismatch on a narrow screen.
 */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }

    const mediaQueryList = window.matchMedia(query);
    const handleChange = (event) => setMatches(event.matches);

    // Re-read on subscribe: the viewport may have changed between render and effect.
    setMatches(mediaQueryList.matches);

    mediaQueryList.addEventListener('change', handleChange);
    return () => mediaQueryList.removeEventListener('change', handleChange);
  }, [query]);

  return matches;
}

/** Matches the sidebar breakpoint defined in the layout stylesheets. */
export const DESKTOP_QUERY = '(min-width: 769px)';