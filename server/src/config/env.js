import 'dotenv/config';
import { z } from 'zod';

const booleanFromString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');
const booleanWithDefault = (defaultValue) =>
  z.enum(['true', 'false'])
    .default(defaultValue ? 'true' : 'false')
    .transform((value) => value === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1).optional(),
  CLERK_SECRET_KEY: z.string().startsWith('sk_').optional(),
  CLERK_PUBLISHABLE_KEY: z.string().startsWith('pk_').optional(),
  UPLOAD_STORAGE_DIR: z.string().min(1).default('.private-uploads'),
  MAX_UPLOAD_SIZE_BYTES: z.coerce.number().int().positive().max(25 * 1024 * 1024).default(10 * 1024 * 1024),
  TRUST_PROXY: booleanFromString,
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),
  CHAT_DAILY_QUOTA: z.coerce.number().int().positive().max(100000).default(100),
  BODY_LIMIT: z.string().default('100kb'),
  AI_PROVIDER: z.enum(['local', 'openai', 'openai-compatible', 'openai-direct']).default('local'),
  AI_PROVIDER_BASE_URL: z.string().url().default('https://api.openai.com/v1'),
  AI_PROVIDER_MODEL: z.string().default('gpt-4o-mini'),
  AI_PROVIDER_API_KEY: z.string().optional(),
  AI_DEFAULT_MODEL: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().regex(/^[a-z0-9][a-z0-9-]{1,63}$/).optional(),
  ),
  AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  AI_MAX_TOKENS: z.coerce.number().int().positive().default(512),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().optional(),
  OPENAI_MODEL_SUPPORTS_VISION: booleanWithDefault(true),
  RAG_EMBEDDING_MODEL: z.string().min(1).default('text-embedding-3-small'),
  RAG_CHUNK_SIZE: z.coerce.number().int().min(200).max(10000).default(1200),
  RAG_CHUNK_OVERLAP: z.coerce.number().int().min(0).max(2000).default(200),
  RAG_TOP_K: z.coerce.number().int().min(1).max(20).default(5),
  RAG_SIMILARITY_THRESHOLD: z.coerce.number().min(0).max(1).default(0.25),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
  ANTHROPIC_API_KEY: z.string().optional(),
  CLAUDE_MODEL: z.string().default('claude-3-5-sonnet-latest'),
  MAX_MESSAGES_PER_REQUEST: z.coerce.number().int().positive().default(50),
  MAX_CONTENT_LENGTH: z.coerce.number().int().positive().default(4000),
}).refine(
  (values) => values.RAG_CHUNK_OVERLAP < values.RAG_CHUNK_SIZE,
  {
    path: ['RAG_CHUNK_OVERLAP'],
    message: 'RAG_CHUNK_OVERLAP must be smaller than RAG_CHUNK_SIZE.',
  },
);

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const details = parsed.error.issues.map((issue) => '  - ' + issue.path.join('.') + ': ' + issue.message).join('\n');
  process.stderr.write('Invalid server environment configuration:\n' + details + '\n\nCopy .env.example to .env and fill in the missing values.\n');
  process.exit(1);
}

const raw = parsed.data;
const configuredProviderKeys = {
  'openai-default': raw.OPENAI_API_KEY || (['openai', 'openai-direct'].includes(raw.AI_PROVIDER) ? raw.AI_PROVIDER_API_KEY : undefined),
  'gemini-default': raw.GEMINI_API_KEY,
  'claude-default': raw.ANTHROPIC_API_KEY,
  'openai-compatible-default': raw.AI_PROVIDER_API_KEY,
};
if (raw.AI_DEFAULT_MODEL && raw.AI_DEFAULT_MODEL !== 'local-offline' && !configuredProviderKeys[raw.AI_DEFAULT_MODEL]) {
  process.stderr.write(`AI_DEFAULT_MODEL "${raw.AI_DEFAULT_MODEL}" is not configured with a server-side provider key.\n`);
  process.exit(1);
}
if (raw.NODE_ENV !== 'test' && !raw.DATABASE_URL) {
  process.stderr.write('DATABASE_URL is required. Start PostgreSQL and configure it in .env.\n');
  process.exit(1);
}

if (raw.NODE_ENV !== 'test' && (!raw.CLERK_SECRET_KEY || !raw.CLERK_PUBLISHABLE_KEY)) {
  process.stderr.write('CLERK_SECRET_KEY and CLERK_PUBLISHABLE_KEY are required.\n');
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
  clerk: Object.freeze({
    secretKey: raw.CLERK_SECRET_KEY,
    publishableKey: raw.CLERK_PUBLISHABLE_KEY,
  }),
  uploads: Object.freeze({
    storageDirectory: raw.UPLOAD_STORAGE_DIR,
    maxSizeBytes: raw.MAX_UPLOAD_SIZE_BYTES,
  }),
  trustProxy: raw.TRUST_PROXY,
  rateLimit: { windowMs: raw.RATE_LIMIT_WINDOW_MS, max: raw.RATE_LIMIT_MAX },
  usage: Object.freeze({ dailyChatQuota: raw.CHAT_DAILY_QUOTA }),
  rag: Object.freeze({
    embeddingModel: raw.RAG_EMBEDDING_MODEL,
    embeddingApiKey: raw.OPENAI_API_KEY,
    embeddingDimensions: 1536,
    chunkSize: raw.RAG_CHUNK_SIZE,
    chunkOverlap: raw.RAG_CHUNK_OVERLAP,
    topK: raw.RAG_TOP_K,
    similarityThreshold: raw.RAG_SIMILARITY_THRESHOLD,
  }),
  bodyLimit: raw.BODY_LIMIT,
  ai: Object.freeze({
    provider: raw.AI_PROVIDER,
    defaultModel: raw.AI_DEFAULT_MODEL,
    baseUrl: raw.AI_PROVIDER_BASE_URL.replace(/\/+$/, ''),
    model,
    apiKey,
    providers: Object.freeze({
      openai: Object.freeze({
        apiKey: raw.OPENAI_API_KEY || (['openai', 'openai-direct'].includes(raw.AI_PROVIDER) ? raw.AI_PROVIDER_API_KEY : undefined),
        model: raw.OPENAI_MODEL || raw.AI_PROVIDER_MODEL,
        supportsVision: raw.OPENAI_MODEL_SUPPORTS_VISION,
      }),
      gemini: Object.freeze({ apiKey: raw.GEMINI_API_KEY, model: raw.GEMINI_MODEL, supportsVision: true }),
      claude: Object.freeze({ apiKey: raw.ANTHROPIC_API_KEY, model: raw.CLAUDE_MODEL, supportsVision: true }),
      openaiCompatible: Object.freeze({
        apiKey: raw.AI_PROVIDER_API_KEY,
        baseUrl: raw.AI_PROVIDER_BASE_URL.replace(/\/+$/, ''),
        model: raw.AI_PROVIDER_MODEL,
        supportsVision: false,
      }),
    }),
    timeoutMs: raw.AI_REQUEST_TIMEOUT_MS,
    maxTokens: raw.AI_MAX_TOKENS,
  }),
  limits: Object.freeze({ maxMessages: raw.MAX_MESSAGES_PER_REQUEST, maxContentLength: raw.MAX_CONTENT_LENGTH }),
});

export default config;
