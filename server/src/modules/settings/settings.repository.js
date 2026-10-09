import { requirePool } from '../../db/pool.js';

function mapSettings(row) {
  return {
    theme: row.theme,
    displayName: row.display_name,
    selectedModelId: row.selected_model_id,
    updatedAt: row.updated_at,
  };
}

export function createSettingsRepository({ databasePool } = {}) {
  const db = requirePool(databasePool);

  return {
    async get(userId) {
      await db.query(
        'INSERT INTO user_settings (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING',
        [userId],
      );
      const result = await db.query(
        `SELECT theme, display_name, selected_model_id, updated_at
         FROM user_settings
         WHERE user_id = $1`,
        [userId],
      );
      return mapSettings(result.rows[0]);
    },

    async update(userId, patch) {
      const columns = {
        theme: 'theme',
        displayName: 'display_name',
        selectedModelId: 'selected_model_id',
      };
      const assignments = [];
      const values = [userId];
      for (const [field, column] of Object.entries(columns)) {
        if (!Object.hasOwn(patch, field)) continue;
        values.push(patch[field]);
        assignments.push(`${column} = $${values.length}`);
      }
      if (!assignments.length) return this.get(userId);

      const result = await db.query(
        `INSERT INTO user_settings (user_id)
         VALUES ($1)
         ON CONFLICT (user_id) DO UPDATE
         SET ${assignments.join(', ')}, updated_at = NOW()
         RETURNING theme, display_name, selected_model_id, updated_at`,
        values,
      );
      return mapSettings(result.rows[0]);
    },
  };
}

export default createSettingsRepository;
