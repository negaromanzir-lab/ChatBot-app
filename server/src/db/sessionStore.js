import connectPgSimple from 'connect-pg-simple';
import session from 'express-session';
import config from '../config/env.js';
import { pool } from './pool.js';

const PgSessionStore = connectPgSimple(session);

export function createSessionStore() {
  if (!pool) {
    throw new Error('PostgreSQL is required for persistent sessions. Configure DATABASE_URL.');
  }
  return new PgSessionStore({
    pool,
    tableName: 'sessions',
    createTableIfMissing: false,
    pruneSessionInterval: 15 * 60,
  });
}

export function createSessionMiddleware({ store, secret = config.sessionSecret } = {}) {
  const sessionSecret =
    secret ?? (config.env === 'test' ? 'test-only-session-secret-not-for-use' : undefined);
  if (!sessionSecret || sessionSecret.length < 32) {
    throw new Error('SESSION_SECRET must contain at least 32 characters.');
  }

  return session({
    name: 'chatbot.sid',
    secret: sessionSecret,
    store,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: config.env === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    },
  });
}
