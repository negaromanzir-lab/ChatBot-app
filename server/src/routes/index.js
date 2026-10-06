import { Router } from 'express';
import createChatRouter from './chat.routes.js';
import config from '../config/env.js';

/**
 * Mounts every versioned API route.
 *
 * `/health` intentionally reports no provider key or model name — it is
 * reachable by load balancers and uptime checks, so it must only expose
 * non-sensitive readiness information.
 */
export function createApiRouter({ chatController, chatService, rateLimiter } = {}) {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      uptimeSeconds: Math.round(process.uptime()),
      provider: config.ai.provider,
      timestamp: new Date().toISOString(),
    });
  });

  router.use('/', createChatRouter({ chatController, chatService, rateLimiter }));

  return router;
}

export default createApiRouter;