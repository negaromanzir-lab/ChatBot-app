/**
 * Persisted user preferences.
 *
 * Separate from conversation history on purpose: clearing history should not
 * reset someone's display name, and vice versa.
 */

import { readJson, writeJson } from './localStorage.js';

const STORAGE_KEY_PREFIX = 'chatbot.preferences.v1';

export const DEFAULT_DISPLAY_NAME = 'You';

export function loadPreferences(userId) {
  const storageKey = userId
    ? `${STORAGE_KEY_PREFIX}.${encodeURIComponent(userId)}`
    : STORAGE_KEY_PREFIX;
  const stored = readJson(storageKey, {});

  const displayName =
    typeof stored?.displayName === 'string' && stored.displayName.trim()
      ? stored.displayName.trim()
      : DEFAULT_DISPLAY_NAME;

  const selectedModelId =
    typeof stored?.selectedModelId === 'string' && /^[a-z0-9][a-z0-9-]{1,63}$/.test(stored.selectedModelId)
      ? stored.selectedModelId
      : null;

  const theme = ['system', 'light', 'dark'].includes(stored?.theme)
    ? stored.theme
    : 'system';

  return { displayName, selectedModelId, theme };
}

export function savePreferences({ displayName, selectedModelId, theme }, userId) {
  const storageKey = userId
    ? `${STORAGE_KEY_PREFIX}.${encodeURIComponent(userId)}`
    : STORAGE_KEY_PREFIX;
  writeJson(storageKey, {
    displayName,
    theme,
    ...(selectedModelId ? { selectedModelId } : {}),
  });
}