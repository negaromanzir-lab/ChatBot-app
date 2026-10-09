import { useCallback, useEffect, useRef, useState } from 'react';
import { loadPreferences, savePreferences } from '../services/preferencesStorage.js';
import { getUserSettings, updateUserSettings } from '../services/settingsService.js';

/**
 * Display-name preference with the same "load once, save on change" shape as
 * the other persisted hooks.
 *
 * Kept separate from conversation storage on purpose: clearing history must not
 * rename the user.
 */
export function usePreferences(userId) {
  const [preferences, setPreferences] = useState(() => loadPreferences(userId));
  const [isLoading, setIsLoading] = useState(Boolean(userId));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const preferencesRef = useRef(preferences);
  const revisionRef = useRef(0);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError(null);
    getUserSettings()
      .then((settings) => {
        if (!active) return;
        const next = {
          displayName: settings.displayName ?? loadPreferences(userId).displayName,
          selectedModelId: settings.selectedModelId,
          theme: settings.theme,
        };
        preferencesRef.current = next;
        setPreferences(next);
        savePreferences(next, userId);
      })
      .catch((caught) => {
        if (active) setError(caught.message || 'Could not load your settings.');
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => { active = false; };
  }, [userId]);

  const updatePreference = useCallback(async (patch) => {
    const previous = preferencesRef.current;
    const revision = ++revisionRef.current;
    const optimistic = { ...previous, ...patch };
    preferencesRef.current = optimistic;
    setPreferences(optimistic);
    setIsSaving(true);
    setError(null);
    try {
      const settings = await updateUserSettings(patch);
      if (revision === revisionRef.current) {
        const saved = {
          displayName: settings.displayName ?? optimistic.displayName,
          selectedModelId: settings.selectedModelId,
          theme: settings.theme,
        };
        preferencesRef.current = saved;
        setPreferences(saved);
        savePreferences(saved, userId);
      }
      return true;
    } catch (caught) {
      if (revision === revisionRef.current) {
        preferencesRef.current = previous;
        setPreferences(previous);
        setError(caught.message || 'Could not save your settings.');
      }
      return false;
    } finally {
      if (revision === revisionRef.current) setIsSaving(false);
    }
  }, [userId]);

  return { preferences, updatePreference, isLoading, isSaving, error };
}

export default usePreferences;
