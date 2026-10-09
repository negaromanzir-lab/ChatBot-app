import ApiError from '../../utils/ApiError.js';
import { listAvailableModels } from '../../services/ai/modelRegistry.js';
import { createSettingsRepository } from './settings.repository.js';

export function createSettingsService({
  repository = createSettingsRepository(),
  modelCatalog = listAvailableModels,
} = {}) {
  async function get(userId) {
    return repository.get(userId);
  }

  async function update(userId, patch) {
    if (Object.hasOwn(patch, 'selectedModelId') && patch.selectedModelId !== null) {
      const available = modelCatalog().models.some(({ id }) => id === patch.selectedModelId);
      if (!available) {
        throw ApiError.badRequest(
          'AI_MODEL_UNAVAILABLE',
          'The selected AI model is not available.',
        );
      }
    }
    return repository.update(userId, patch);
  }

  return { get, update };
}

export default createSettingsService;
