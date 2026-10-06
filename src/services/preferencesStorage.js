/**
 * Persisted user preferences.
 *
 * Separate from conversation history on purpose: clearing history should not
 * reset someone's display name, and vice versa.
 */

import { readJson, writeJson } from './localStorage.js';

const STORAGE_KEY = 'chatbot.preferences.v1';

export const DEFAULT_DISPLAY_NAME = 'You';

export function loadPreferences() {
  const stored = readJson(STORAGE_KEY, {});

  const displayName =
    typeof stored?.displayName === 'string' && stored.displayName.trim()
      ? stored.displayName.trim()
      : DEFAULT_DISPLAY_NAME;

  return { displayName };
}

export function savePreferences({ displayName }) {
  writeJson(STORAGE_KEY, { displayName });
}