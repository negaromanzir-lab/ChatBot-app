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
import createConversationsRouter from '../modules/conversations/conversation.routes.js';
import { createRequireAuth } from '../middleware/requireAuth.js';

export function createApiRouter({
  chatController,
  chatService,
  rateLimiter,
  authService,
  conversationController,
  conversationService,
  clerkClient,
  authResolver,
  requireAuthMiddleware,
  chatAuthMiddleware,
} = {}) {
  const router = Router();
  const authenticate =
    requireAuthMiddleware ??
    createRequireAuth({ authService, clerkClient, authResolver });

  router.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      uptimeSeconds: Math.round(process.uptime()),
      provider: config.ai.provider,
      timestamp: new Date().toISOString(),
    });
  });

  router.use(
    '/conversations',
    authenticate,
    createConversationsRouter({ conversationController, conversationService }),
  );
  router.use(
    '/',
    chatAuthMiddleware ?? authenticate,
    createChatRouter({ chatController, chatService, rateLimiter, conversationService }),
  );

  return router;
}

export default createApiRouter;