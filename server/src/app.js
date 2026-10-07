import { randomUUID } from 'node:crypto';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import config from './config/env.js';
import logger from './config/logger.js';
import createApiRouter from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { createSessionMiddleware, createSessionStore } from './db/sessionStore.js';
import { verifyOrigin } from './middleware/verifyOrigin.js';

/**
 * Builds the Express application without starting a listener.
 *
 * Separating construction from `listen()` is what makes the routes testable:
 * the suite mounts this app on an ephemeral port and drives it with fetch,
 * while `server.js` owns the process lifecycle.
 *
 * Dependency injection (`chatController`, `chatService`, `rateLimiter`) lets
 * tests substitute a fake provider or disable rate limiting without touching
 * module state or environment variables.
 */
export function createApp(options = {}) {
  const app = express();

  // Required for correct client IPs (and therefore rate limiting) behind a
  // reverse proxy. Config refuses to boot in production without it.
  app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');

  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        // Honour an upstream id for cross-service tracing, otherwise mint one.
        // Always returns a value: an undefined return would leave `req.id`
        // unset and error responses would carry no correlation id at all.
        const incoming = req.headers['x-request-id'];
        const requestId =
          typeof incoming === 'string' && incoming.trim() ? incoming.trim() : randomUUID();

        req.id = requestId;
        res.setHeader('x-request-id', requestId);
        return requestId;
      },
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
    }),
  );

  app.use(helmet());

  // Explicit allowlist rather than a wildcard. A disallowed origin is refused
  // by omitting the CORS headers rather than by throwing, so the browser blocks
  // the read and the request does not spam the error log with 500s.
  app.use(
    cors({
      credentials: true,
      origin(origin, callback) {
        // Same-origin, curl, and server-to-server calls send no Origin header.
        if (!origin) return callback(null, true);
        if (config.corsOrigins.includes(origin)) return callback(null, true);
        logger.warn({ origin }, 'Request blocked by CORS origin policy');
        return callback(null, false);
      },
      methods: ['GET', 'POST', 'PATCH', 'DELETE'],
      maxAge: 600,
    }),
  );

  app.use(express.json({ limit: config.bodyLimit }));

  const sessionStore =
    options.sessionStore ??
    (config.env === 'test' ? undefined : createSessionStore());
  app.use(
    createSessionMiddleware({
      store: sessionStore,
      secret: options.sessionSecret,
    }),
  );
  app.use(verifyOrigin);
  app.use('/api', createApiRouter(options));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export default createApp;