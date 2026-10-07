import { requirePool } from '../../db/pool.js';

export function createAuthRepository({ databasePool } = {}) {
  const db = requirePool(databasePool);

  return {
    async findClerkUserById(clerkUserId) {
      const result = await db.query(
        'SELECT id, clerk_user_id, email, created_at FROM users WHERE clerk_user_id = $1',
        [clerkUserId],
      );
      return result.rows[0] ?? null;
    },

    async syncClerkUser({ clerkUserId, email }) {
      const client = await db.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
          [email],
        );
        const result = await client.query(
          `SELECT id, clerk_user_id, email
           FROM users
           WHERE clerk_user_id = $1 OR email = $2
           FOR UPDATE`,
          [clerkUserId, email],
        );
        const clerkIdentity = result.rows.find((row) => row.clerk_user_id === clerkUserId);
        const matchingEmail = result.rows.find((row) => row.email === email);
        if (
          (matchingEmail?.clerk_user_id &&
            matchingEmail.clerk_user_id !== clerkUserId) ||
          (clerkIdentity && matchingEmail && matchingEmail.id !== clerkIdentity.id)
        ) {
          const error = new Error('Email is already linked to a Clerk identity.');
          error.code = 'CLERK_IDENTITY_CONFLICT';
          throw error;
        }

        let user;
        if (clerkIdentity) {
          const updated = await client.query(
            `UPDATE users
             SET email = $2, updated_at = NOW()
             WHERE id = $1
             RETURNING id, clerk_user_id, email, created_at`,
            [clerkIdentity.id, email],
          );
          user = updated.rows[0];
        } else if (matchingEmail) {
          const linked = await client.query(
            `UPDATE users
             SET clerk_user_id = $2, updated_at = NOW()
             WHERE id = $1
             RETURNING id, clerk_user_id, email, created_at`,
            [matchingEmail.id, clerkUserId],
          );
          user = linked.rows[0];
        } else {
          const inserted = await client.query(
            `INSERT INTO users (clerk_user_id, email)
             VALUES ($1, $2)
             RETURNING id, clerk_user_id, email, created_at`,
            [clerkUserId, email],
          );
          user = inserted.rows[0];
        }

        await client.query('COMMIT');
        return user;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
