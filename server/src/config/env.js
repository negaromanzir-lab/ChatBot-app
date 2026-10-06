import 'dotenv/config';
import { z } from 'zod';

/**
 * Single source of truth for server configuration.
 *
 * Every value is read from `process.env` exactly once, validated, and then
 * frozen. Nothing else in the server reads `process.env` directly, so a typo
 * or a missing variable fails loudly here at boot instead of surfacing as a
 * confusing runtime error inside a request handler.
 *
 * NOTE: none of these variables may be prefixed with `VITE_`. Vite inlines
 * `VITE_*` variables into the browser bundle at build time, which would publish
 * the AI key to every visitor. See `.env.example`.
 */

const booleanFromString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const schema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),

  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),

  // Comma-separated allowlist. `*` is rejected on purpose in production so an
  // accidental wildcard cannot ship the API to the whole internet.
  CORS_ORIGINS: z.string().default('http://localhost:5173'),

  // Required in production so client IPs are read from X-Forwarded-For and rate
  // limiting does not collapse every visitor into a single bucket.
  TRUST_PROXY: booleanFromString,

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),

  BODY_LIMIT: z.string().default('100kb'),

  // ---- AI provider -------------------------------------------------------
  // `local` is a deterministic offline provider used for development and tests.
  // `openai` targets any OpenAI-compatible chat-completions endpoint.
  AI_PROVIDER: z.enum(['local', 'openai']).default('local'),
  AI_PROVIDER_BASE_URL: z.string().url().default('https://api.openai.com/v1'),
  AI_PROVIDER_MODEL: z.string().default('gpt-4o-mini'),
  AI_PROVIDER_API_KEY: z.string().optional(),
  AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  AI_MAX_TOKENS: z.coerce.number().int().positive().default(512),

  // ---- Request limits ----------------------------------------------------
  MAX_MESSAGES_PER_REQUEST: z.coerce.number().int().positive().default(50),
  MAX_CONTENT_LENGTH: z.coerce.number().int().positive().default(4000),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  // Thrown before the logger exists, so write directly to stderr.
  process.stderr.write(
    `Invalid server environment configuration:\n${details}\n\n` +
      'Copy .env.example to .env and fill in the missing values.\n',
  );
  process.exit(1);
}

const raw = parsed.data;

if (raw.NODE_ENV === 'production') {
  if (raw.AI_PROVIDER === 'openai' && !raw.AI_PROVIDER_API_KEY) {
    process.stderr.write(
      'AI_PROVIDER=openai requires AI_PROVIDER_API_KEY to be set.\n',
    );
    process.exit(1);
  }
  if (raw.CORS_ORIGINS.split(',').map((o) => o.trim()).includes('*')) {
    process.stderr.write(
      'CORS_ORIGINS must not be "*" in production. List explicit origins.\n',
    );
    process.exit(1);
  }
  if (!raw.TRUST_PROXY) {
    process.stderr.write(
      'TRUST_PROXY must be true in production so client IPs are read from the proxy.\n',
    );
    process.exit(1);
  }
}

export const config = Object.freeze({
  env: raw.NODE_ENV,
  host: raw.HOST,
  port: raw.PORT,
  logLevel: raw.NODE_ENV === 'test' ? 'silent' : raw.LOG_LEVEL,
  corsOrigins: raw.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  trustProxy: raw.TRUST_PROXY,
  rateLimit: {
    windowMs: raw.RATE_LIMIT_WINDOW_MS,
    max: raw.RATE_LIMIT_MAX,
  },
  bodyLimit: raw.BODY_LIMIT,
  ai: Object.freeze({
    provider: raw.AI_PROVIDER,
    baseUrl: raw.AI_PROVIDER_BASE_URL.replace(/\/+$/, ''),
    model: raw.AI_PROVIDER_MODEL,
    apiKey: raw.AI_PROVIDER_API_KEY,
    timeoutMs: raw.AI_REQUEST_TIMEOUT_MS,
    maxTokens: raw.AI_MAX_TOKENS,
  }),
  limits: Object.freeze({
    maxMessages: raw.MAX_MESSAGES_PER_REQUEST,
    maxContentLength: raw.MAX_CONTENT_LENGTH,
  }),
});

export default config;