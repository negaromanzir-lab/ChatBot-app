import { describe, expect, it, vi } from 'vitest';
import { createSettingsRepository } from '../src/modules/settings/settings.repository.js';

describe('settings repository', () => {
  it('creates default settings for the specified user and returns the stored record', async () => {
    const databasePool = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{
            theme: 'system',
            display_name: null,
            selected_model_id: null,
            updated_at: new Date('2026-01-01T00:00:00Z'),
          }],
        }),
    };
    const repository = createSettingsRepository({ databasePool });

    await expect(repository.get('user-id')).resolves.toMatchObject({
      theme: 'system',
      displayName: null,
      selectedModelId: null,
    });
    expect(databasePool.query.mock.calls[0][1]).toEqual(['user-id']);
    expect(databasePool.query.mock.calls[1][1]).toEqual(['user-id']);
  });

  it('updates only supplied columns for that user', async () => {
    const databasePool = {
      query: vi.fn().mockResolvedValue({
        rows: [{
          theme: 'dark',
          display_name: null,
          selected_model_id: 'openai-default',
          updated_at: new Date(),
        }],
      }),
    };
    const repository = createSettingsRepository({ databasePool });

    await expect(repository.update('user-id', {
      theme: 'dark',
      selectedModelId: 'openai-default',
    })).resolves.toMatchObject({ theme: 'dark', selectedModelId: 'openai-default' });

    expect(databasePool.query.mock.calls[0][0]).toContain('theme = $2');
    expect(databasePool.query.mock.calls[0][0]).toContain('selected_model_id = $3');
    expect(databasePool.query.mock.calls[0][1])
      .toEqual(['user-id', 'dark', 'openai-default']);
  });
});
