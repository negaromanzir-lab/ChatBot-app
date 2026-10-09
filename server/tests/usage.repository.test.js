import { describe, expect, it, vi } from 'vitest';
import { createUsageRepository } from '../src/modules/usage/usage.repository.js';

describe('usage repository', () => {
  it('increments daily usage atomically only while below the configured limit', async () => {
    const databasePool = {
      query: vi.fn().mockResolvedValue({ rows: [{ request_count: 4 }] }),
    };
    const repository = createUsageRepository({ databasePool });

    await expect(repository.consumeChatRequest(
      'user-id',
      '2026-10-09',
      5,
    )).resolves.toBe(4);

    const [query, values] = databasePool.query.mock.calls[0];
    expect(query).toContain('ON CONFLICT (user_id, usage_date) DO UPDATE');
    expect(query).toContain('WHERE chat_usage_daily.request_count < $3');
    expect(values).toEqual(['user-id', '2026-10-09', 5]);
  });

  it('returns null when the daily quota has already been consumed', async () => {
    const databasePool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    const repository = createUsageRepository({ databasePool });

    await expect(repository.consumeChatRequest(
      'user-id',
      '2026-10-09',
      5,
    )).resolves.toBeNull();
  });
});
