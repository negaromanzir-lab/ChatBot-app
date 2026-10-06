import { useCallback, useEffect, useState } from 'react';
import { readJson, writeJson } from '../services/localStorage.js';

/**
 * Theme preference and its resolved value.
 *
 * The preference can be 'system', in which case the OS decides. That is a real
 * third option rather than a nicety: it is the only setting that stays correct
 * when someone switches their laptop between light and dark.
 *
 * The resolved theme is applied by setting `data-theme` on <html>, and every
 * colour in the app is a CSS custom property, so nothing re-renders on a theme
 * change and there is no flash of the wrong palette.
 */

export const THEME_STORAGE_KEY = 'chatbot.theme';

export const THEME_PREFERENCES = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const VALID_PREFERENCES = new Set(THEME_PREFERENCES.map(({ value }) => value));

function readStoredPreference() {
  const stored = readJson(THEME_STORAGE_KEY, null);
  return VALID_PREFERENCES.has(stored) ? stored : 'system';
}

function getSystemTheme() {
  // `matchMedia` is absent in some test environments, so treat that as light
  // instead of throwing during render.
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'light';
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function useTheme() {
  const [preference, setPreference] = useState(readStoredPreference);
  const [systemTheme, setSystemTheme] = useState(getSystemTheme);

  // Follow the OS while the preference is 'system'.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }

    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (event) => setSystemTheme(event.matches ? 'dark' : 'light');

    query.addEventListener('change', handleChange);
    return () => query.removeEventListener('change', handleChange);
  }, []);

  const theme = preference === 'system' ? systemTheme : preference;

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    // Keeps scrollbars, form controls and the address bar in step.
    root.style.colorScheme = theme;
    writeJson(THEME_STORAGE_KEY, preference);
  }, [preference, theme]);

  const toggleTheme = useCallback(() => {
    setPreference(theme === 'dark' ? 'light' : 'dark');
  }, [theme]);

  return { preference, setPreference, theme, toggleTheme };
}