import { randomUUID } from 'node:crypto';
import { createApp } from './app.js';
import config from './config/env.js';
import logger from './config/logger.js';
import { pool } from './db/pool.js';

/**
 * Process entry point. Owns startup, the request timeout, and graceful
 * shutdown. All HTTP behaviour lives in app.js so it stays testable.
 */

const app = createApp();
const server = app.listen(config.port, config.host, () => {
  logger.info(
    {
      host: config.host,
      port: config.port,
      env: config.env,
      provider: config.ai.provider,
      corsOrigins: config.corsOrigins,
    },
    'Chat API listening',
  );
});

// Backstop for the whole request. The provider call already has its own
// shorter timeout; this catches anything else that stalls — a slow body read,
// a hung middleware — so sockets are not left open indefinitely.
server.requestTimeout = Math.max(config.ai.timeoutMs + 5_000, 30_000);
server.headersTimeout = 20_000;
server.keepAliveTimeout = 65_000;

let shuttingDown = false;

/**
 * Stop accepting connections, let in-flight requests finish, then close.
 *
 * The hard timeout matters: without it a hung upstream connection would keep
 * the process alive indefinitely and the orchestrator would SIGKILL it.
 */
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Shutting down gracefully');

  const forceExitTimer = setTimeout(() => {
    logger.error('Graceful shutdown timed out; forcing exit');
    process.exit(1);
  }, 10_000);
  forceExitTimer.unref();

  server.close(async (error) => {
    if (error) {
      logger.error({ err: error }, 'Error while closing server');
      process.exit(1);
    }
    await pool?.end();
    logger.info('Server closed');
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason, requestId: randomUUID() }, 'Unhandled promise rejection');
  shutdown('unhandledRejection');
});

process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'Uncaught exception');
  process.exit(1);
});

export default server;