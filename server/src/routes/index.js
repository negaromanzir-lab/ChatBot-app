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
import createAuthRouter from '../modules/auth/auth.routes.js';
import createConversationsRouter from '../modules/conversations/conversation.routes.js';
import requireAuth from '../middleware/requireAuth.js';

export function createApiRouter({
  chatController,
  chatService,
  rateLimiter,
  authController,
  authService,
  conversationController,
  conversationService,
  authRateLimiter,
  chatAuthMiddleware,
} = {}) {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      uptimeSeconds: Math.round(process.uptime()),
      provider: config.ai.provider,
      timestamp: new Date().toISOString(),
    });
  });

  router.use(
    '/auth',
    createAuthRouter({ authController, authService, rateLimiter: authRateLimiter }),
  );
  router.use(
    '/conversations',
    requireAuth,
    createConversationsRouter({ conversationController, conversationService }),
  );
  router.use(
    '/',
    chatAuthMiddleware ?? requireAuth,
    createChatRouter({ chatController, chatService, rateLimiter, conversationService }),
  );

  return router;
}

export default createApiRouter;