import 'dotenv/config';
import { z } from 'zod';

const booleanFromString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1).optional(),
  SESSION_SECRET: z.string().min(32).optional(),
  TRUST_PROXY: booleanFromString,
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),
  BODY_LIMIT: z.string().default('100kb'),
  AI_PROVIDER: z.enum(['local', 'openai', 'openai-compatible', 'openai-direct']).default('local'),
  AI_PROVIDER_BASE_URL: z.string().url().default('https://api.openai.com/v1'),
  AI_PROVIDER_MODEL: z.string().default('gpt-4o-mini'),
  AI_PROVIDER_API_KEY: z.string().optional(),
  AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  AI_MAX_TOKENS: z.coerce.number().int().positive().default(512),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().optional(),
  MAX_MESSAGES_PER_REQUEST: z.coerce.number().int().positive().default(50),
  MAX_CONTENT_LENGTH: z.coerce.number().int().positive().default(4000),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const details = parsed.error.issues.map((issue) => '  - ' + issue.path.join('.') + ': ' + issue.message).join('\n');
  process.stderr.write('Invalid server environment configuration:\n' + details + '\n\nCopy .env.example to .env and fill in the missing values.\n');
  process.exit(1);
}

const raw = parsed.data;
if (raw.NODE_ENV !== 'test' && !raw.DATABASE_URL) {
  process.stderr.write('DATABASE_URL is required. Start PostgreSQL and configure it in .env.\n');
  process.exit(1);
}

if (raw.NODE_ENV !== 'test' && (!raw.SESSION_SECRET || raw.SESSION_SECRET.length < 32)) {
  process.stderr.write('SESSION_SECRET must be set to a random value of at least 32 characters.\n');
  process.exit(1);
}
if (raw.NODE_ENV === 'production') {
  if (
    ['openai', 'openai-direct', 'openai-compatible'].includes(raw.AI_PROVIDER) &&
    !(raw.AI_PROVIDER_API_KEY || raw.OPENAI_API_KEY)
  ) {
    process.stderr.write('AI provider requires API key in production.\n');
    process.exit(1);
  }
  if (raw.CORS_ORIGINS.split(',').map((o) => o.trim()).includes('*')) {
    process.stderr.write('CORS_ORIGINS must not be "*" in production. List explicit origins.\n');
    process.exit(1);
  }
  if (!raw.TRUST_PROXY) {
    process.stderr.write('TRUST_PROXY must be true in production so client IPs are read from the proxy.\n');
    process.exit(1);
  }
}

const apiKey =
  raw.AI_PROVIDER === 'openai' || raw.AI_PROVIDER === 'openai-direct'
    ? raw.OPENAI_API_KEY || raw.AI_PROVIDER_API_KEY || undefined
    : raw.AI_PROVIDER_API_KEY || raw.OPENAI_API_KEY || undefined;
const model =
  raw.AI_PROVIDER === 'openai' || raw.AI_PROVIDER === 'openai-direct'
    ? raw.OPENAI_MODEL || raw.AI_PROVIDER_MODEL
    : raw.AI_PROVIDER_MODEL;

export const config = Object.freeze({
  env: raw.NODE_ENV,
  host: raw.HOST,
  port: raw.PORT,
  logLevel: raw.NODE_ENV === 'test' ? 'silent' : raw.LOG_LEVEL,
  corsOrigins: raw.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean),
  databaseUrl: raw.DATABASE_URL,
  sessionSecret: raw.SESSION_SECRET,
  trustProxy: raw.TRUST_PROXY,
  rateLimit: { windowMs: raw.RATE_LIMIT_WINDOW_MS, max: raw.RATE_LIMIT_MAX },
  bodyLimit: raw.BODY_LIMIT,
  ai: Object.freeze({ provider: raw.AI_PROVIDER, baseUrl: raw.AI_PROVIDER_BASE_URL.replace(/\/+$/, ''), model, apiKey, timeoutMs: raw.AI_REQUEST_TIMEOUT_MS, maxTokens: raw.AI_MAX_TOKENS }),
  limits: Object.freeze({ maxMessages: raw.MAX_MESSAGES_PER_REQUEST, maxContentLength: raw.MAX_CONTENT_LENGTH }),
});

export default config;
