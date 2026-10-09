import { describe, expect, it, vi } from 'vitest';
import { createSettingsService } from '../src/modules/settings/settings.service.js';

describe('settings service', () => {
  it('rejects a selected model that is not available in the server registry', async () => {
    const repository = { update: vi.fn() };
    const service = createSettingsService({
      repository,
      modelCatalog: () => ({
        models: [{ id: 'local-offline' }],
        defaultModelId: 'local-offline',
      }),
    });

    await expect(service.update('user-id', {
      selectedModelId: 'unavailable-model',
    })).rejects.toMatchObject({ code: 'AI_MODEL_UNAVAILABLE', statusCode: 400 });
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('persists a selected model only after registry validation', async () => {
    const settings = { theme: 'system', selectedModelId: 'gemini-default' };
    const repository = { update: vi.fn().mockResolvedValue(settings) };
    const service = createSettingsService({
      repository,
      modelCatalog: () => ({
        models: [{ id: 'gemini-default' }],
        defaultModelId: 'gemini-default',
      }),
    });

    await expect(service.update('user-id', {
      selectedModelId: 'gemini-default',
    })).resolves.toEqual(settings);
    expect(repository.update).toHaveBeenCalledWith('user-id', {
      selectedModelId: 'gemini-default',
    });
  });
});
