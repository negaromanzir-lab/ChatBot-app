import { apiRequest } from './apiClient.js';

const VALID_THEMES = new Set(['system', 'light', 'dark']);
const MODEL_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,63}$/;

function validateSettings(settings) {
  if (
    !settings
    || !VALID_THEMES.has(settings.theme)
    || (settings.displayName !== null && typeof settings.displayName !== 'string')
    || (
      settings.selectedModelId !== null
      && (typeof settings.selectedModelId !== 'string' || !MODEL_ID_PATTERN.test(settings.selectedModelId))
    )
  ) {
    throw new Error('The server returned invalid user settings.');
  }
  return settings;
}

export async function getUserSettings() {
  const result = await apiRequest('/settings');
  return validateSettings(result?.settings);
}

export async function updateUserSettings(patch) {
  const result = await apiRequest('/settings', { method: 'PATCH', body: patch });
  return validateSettings(result?.settings);
}
