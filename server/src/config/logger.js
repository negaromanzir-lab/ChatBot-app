import pino from 'pino';
import config from './env.js';

/**
 * Application logger.
 *
 * `redact` is the important part: request/response payloads and headers can
 * carry an AI key or a bearer token, so those paths are stripped before any
 * line reaches a log sink. Redaction happens at serialization time, which means
 * a future `log.info({ body })` cannot accidentally leak a secret.
 */
const redactPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'req.headers["x-goog-api-key"]',
  'req.body.messages',
  'res.headers["set-cookie"]',
  'config.ai.apiKey',
  'apiKey',
  '*.apiKey',
  'password',
  '*.password',
];

export const logger = pino({
  level: config.logLevel,
  redact: { paths: redactPaths, censor: '[redacted]' },
  base: config.env === 'production' ? undefined : { service: 'chatbot-api' },
  transport:
    config.env === 'development'
      ? { target: 'pino/file', options: { destination: 1 } }
      : undefined,
});

export default logger;