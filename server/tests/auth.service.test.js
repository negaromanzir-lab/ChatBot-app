import { describe, expect, it, vi } from 'vitest';
import { createAuthService } from '../src/modules/auth/auth.service.js';

describe('Clerk user synchronization', () => {
  it('synchronizes the Clerk ID with the verified account email', async () => {
    const repository = {
      findClerkUserById: vi.fn().mockResolvedValue(null),
      syncClerkUser: vi.fn().mockResolvedValue({
        id: 'local-user-id',
        clerk_user_id: 'user_clerk_123',
        email: 'person@example.com',
      }),
    };
    const service = createAuthService({ repository });

    await expect(
      service.syncClerkUser({
        clerkUserId: 'user_clerk_123',
        email: 'Person@Example.com',
      }),
    ).resolves.toMatchObject({
      id: 'local-user-id',
      clerk_user_id: 'user_clerk_123',
      email: 'person@example.com',
    });
    expect(repository.syncClerkUser).toHaveBeenCalledWith({
      clerkUserId: 'user_clerk_123',
      email: 'person@example.com',
    });
  });

  it('does not create a local user without a Clerk ID and verified email', async () => {
    const repository = {
      findClerkUserById: vi.fn(),
      syncClerkUser: vi.fn(),
    };
    const service = createAuthService({ repository });

    await expect(
      service.syncClerkUser({ clerkUserId: 'user_clerk_123', email: '' }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'VERIFIED_EMAIL_REQUIRED' });
    expect(repository.syncClerkUser).not.toHaveBeenCalled();
  });

  it('maps an identity collision to a safe conflict response', async () => {
    const repository = {
      findClerkUserById: vi.fn(),
      syncClerkUser: vi.fn().mockRejectedValue({ code: 'CLERK_IDENTITY_CONFLICT' }),
    };
    const service = createAuthService({ repository });

    await expect(
      service.syncClerkUser({
        clerkUserId: 'user_clerk_123',
        email: 'person@example.com',
      }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'ACCOUNT_LINK_CONFLICT' });
  });
});
