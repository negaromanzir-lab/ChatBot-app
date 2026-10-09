import { describe, expect, it, vi } from 'vitest';
import { createUsageService } from '../src/modules/usage/usage.service.js';

describe('usage service', () => {
  it('uses the UTC date and reports remaining requests and reset time', async () => {
    const repository = {
      consumeChatRequest: vi.fn().mockResolvedValue(3),
    };
    const service = createUsageService({
      repository,
      dailyLimit: 8,
      clock: () => new Date('2026-10-09T23:59:59.000Z'),
    });

    await expect(service.consumeChatRequest('user-id')).resolves.toEqual({
      allowed: true,
      limit: 8,
      remaining: 5,
      resetsAt: new Date('2026-10-10T00:00:00.000Z'),
    });
    expect(repository.consumeChatRequest).toHaveBeenCalledWith(
      'user-id',
      '2026-10-09',
      8,
    );
  });

  it('denies usage when the atomic database reservation exceeds the limit', async () => {
    const repository = {
      consumeChatRequest: vi.fn().mockResolvedValue(null),
    };
    const service = createUsageService({
      repository,
      dailyLimit: 8,
      clock: () => new Date('2026-10-09T12:00:00.000Z'),
    });

    await expect(service.consumeChatRequest('user-id')).resolves.toMatchObject({
      allowed: false,
      limit: 8,
      remaining: 0,
    });
  });
});
