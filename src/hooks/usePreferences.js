import { useCallback, useState } from 'react';
import { loadPreferences, savePreferences } from '../services/preferencesStorage.js';

/**
 * Display-name preference with the same "load once, save on change" shape as
 * the other persisted hooks.
 *
 * Kept separate from conversation storage on purpose: clearing history must not
 * rename the user.
 */
export function usePreferences() {
  const [preferences, setPreferences] = useState(loadPreferences);

  const updatePreference = useCallback((patch) => {
    setPreferences((current) => {
      const next = { ...current, ...patch };
      savePreferences(next);
      return next;
    });
  }, []);

  return { preferences, updatePreference };
}

export default usePreferences;
