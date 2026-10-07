// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createAuthService } from '../src/modules/auth/auth.service.js';

const user = {
  id: 'user-id',
  email: 'person@example.com',
  created_at: new Date('2026-01-01T00:00:00.000Z'),
};

describe('auth service', () => {
  it('stores a bcrypt hash and returns no password material', async () => {
    const repository = {
      createUser: vi.fn(async ({ email }) => ({ ...user, email })),
      findUserByEmail: vi.fn(),
      findUserById: vi.fn(),
    };
    const service = createAuthService({ repository });

    const result = await service.register({
      email: 'person@example.com',
      password: 'a-secure-password',
    });

    const [{ passwordHash }] = repository.createUser.mock.calls[0];
    expect(passwordHash).not.toBe('a-secure-password');
    expect(passwordHash).toMatch(/^\$2[aby]\$/);
    expect(result).toEqual({
      id: user.id,
      email: user.email,
      createdAt: user.created_at,
    });
    expect(JSON.stringify(result)).not.toContain('password');
  });

  it('uses one generic credential error for missing users and wrong passwords', async () => {
    const repository = {
      createUser: vi.fn(),
      findUserByEmail: vi.fn().mockResolvedValue(null),
      findUserById: vi.fn(),
    };
    const service = createAuthService({ repository });

    await expect(
      service.login({ email: user.email, password: 'wrong-password' }),
    ).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
      statusCode: 401,
    });
  });
});
