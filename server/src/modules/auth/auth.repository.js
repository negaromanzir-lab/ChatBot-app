import { requirePool } from '../../db/pool.js';

export function createAuthRepository({ databasePool } = {}) {
  const db = requirePool(databasePool);

  return {
    async findUserByEmail(email) {
      const result = await db.query(
        'SELECT id, email, password_hash, created_at FROM users WHERE email = $1',
        [email],
      );
      return result.rows[0] ?? null;
    },

    async findUserById(id) {
      const result = await db.query(
        'SELECT id, email, created_at FROM users WHERE id = $1',
        [id],
      );
      return result.rows[0] ?? null;
    },

    async createUser({ email, passwordHash }) {
      const result = await db.query(
        `INSERT INTO users (email, password_hash)
         VALUES ($1, $2)
         RETURNING id, email, created_at`,
        [email, passwordHash],
      );
      return result.rows[0];
    },
  };
}
