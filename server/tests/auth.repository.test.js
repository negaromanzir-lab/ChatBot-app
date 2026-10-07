import { describe, expect, it, vi } from 'vitest';
import { createAuthRepository } from '../src/modules/auth/auth.repository.js';

function createPoolWithRows(rows) {
  const client = {
    query: vi.fn(async (sql) => {
      if (sql.includes('SELECT id, clerk_user_id, email')) {
        return { rows };
      }
      if (sql.includes('SET clerk_user_id = $2')) {
        return {
          rows: [{
            id: rows[0].id,
            clerk_user_id: 'user_clerk_123',
            email: rows[0].email,
            created_at: new Date('2026-01-01T00:00:00.000Z'),
          }],
        };
      }
      return { rows: [], rowCount: 0 };
    }),
    release: vi.fn(),
  };
  return { client, pool: { connect: vi.fn().mockResolvedValue(client) } };
}

describe('Clerk user repository', () => {
  it('links a verified matching legacy account without changing its local ID', async () => {
    const legacyAccount = {
      id: 'legacy-local-user-id',
      clerk_user_id: null,
      email: 'person@example.com',
    };
    const { client, pool } = createPoolWithRows([legacyAccount]);
    const repository = createAuthRepository({ databasePool: pool });

    const user = await repository.syncClerkUser({
      clerkUserId: 'user_clerk_123',
      email: 'person@example.com',
    });

    expect(user).toMatchObject({
      id: 'legacy-local-user-id',
      clerk_user_id: 'user_clerk_123',
      email: 'person@example.com',
    });
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('SET clerk_user_id = $2'),
      ['legacy-local-user-id', 'user_clerk_123'],
    );
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('rejects an email already associated with another Clerk identity', async () => {
    const { client, pool } = createPoolWithRows([{
      id: 'other-user-id',
      clerk_user_id: 'user_clerk_other',
      email: 'person@example.com',
    }]);
    const repository = createAuthRepository({ databasePool: pool });

    await expect(
      repository.syncClerkUser({
        clerkUserId: 'user_clerk_123',
        email: 'person@example.com',
      }),
    ).rejects.toMatchObject({ code: 'CLERK_IDENTITY_CONFLICT' });
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.query).not.toHaveBeenCalledWith(
      expect.stringContaining('UPDATE users'),
      expect.anything(),
    );
    expect(client.release).toHaveBeenCalledOnce();
  });
});
