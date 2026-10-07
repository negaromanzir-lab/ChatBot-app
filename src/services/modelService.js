import { apiRequest } from './apiClient.js';

export async function listAvailableModels() {
  const result = await apiRequest('/models');
  if (
    !result
    || (result.defaultModelId !== null && typeof result.defaultModelId !== 'string')
    || !Array.isArray(result.models)
    || result.models.some(
      (model) =>
        typeof model?.id !== 'string'
        || typeof model?.label !== 'string'
        || typeof model?.provider !== 'string'
        || typeof model?.supportsVision !== 'boolean',
    )
  ) {
    throw new Error('The server returned an invalid model list.');
  }
  return result;
}
