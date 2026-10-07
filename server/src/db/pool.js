import pg from 'pg';
import config from '../config/env.js';

const { Pool } = pg;

export const pool = config.databaseUrl
  ? new Pool({
      connectionString: config.databaseUrl,
      ssl:
        config.env === 'production'
          ? { rejectUnauthorized: true }
          : undefined,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    })
  : null;

export function requirePool(databasePool = pool) {
  if (!databasePool) {
    const error = new Error('Database access requires DATABASE_URL.');
    error.code = 'DATABASE_NOT_CONFIGURED';
    throw error;
  }
  return databasePool;
}
