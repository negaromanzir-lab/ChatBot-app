import { requirePool } from '../../db/pool.js';

export function createUsageRepository({ databasePool } = {}) {
  const db = requirePool(databasePool);

  return {
    async consumeChatRequest(userId, usageDate, dailyLimit) {
      const result = await db.query(
        `INSERT INTO chat_usage_daily (user_id, usage_date, request_count)
         VALUES ($1, $2, 1)
         ON CONFLICT (user_id, usage_date) DO UPDATE
         SET request_count = chat_usage_daily.request_count + 1
         WHERE chat_usage_daily.request_count < $3
         RETURNING request_count`,
        [userId, usageDate, dailyLimit],
      );
      return result.rows[0]?.request_count ?? null;
    },
  };
}

export default createUsageRepository;
