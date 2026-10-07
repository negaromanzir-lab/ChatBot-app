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

  const selectedModelId =
    typeof stored?.selectedModelId === 'string' && /^[a-z0-9][a-z0-9-]{1,63}$/.test(stored.selectedModelId)
      ? stored.selectedModelId
      : null;

  return { displayName, selectedModelId };
}

export function savePreferences({ displayName, selectedModelId }) {
  writeJson(STORAGE_KEY, {
    displayName,
    ...(selectedModelId ? { selectedModelId } : {}),
  });
}