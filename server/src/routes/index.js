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
import { listAvailableModels } from '../services/ai/modelRegistry.js';
import createFileRouter from '../modules/uploads/file.routes.js';
import createSettingsRouter from '../modules/settings/settings.routes.js';
import { pool } from '../db/pool.js';
import logger from '../config/logger.js';

export function createApiRouter({
  chatController,
  chatService,
  rateLimiter,
  authService,
  conversationController,
  conversationService,
  uploadController,
  uploadService,
  settingsController,
  settingsService,
  clerkClient,
  authResolver,
  requireAuthMiddleware,
  chatAuthMiddleware,
  chatQuotaMiddleware,
  readinessCheck,
} = {}) {
  const router = Router();
  const authenticate =
    requireAuthMiddleware ??
    createRequireAuth({ authService, clerkClient, authResolver });

  router.get('/models', authenticate, (_req, res) => {
    res.status(200).json(listAvailableModels());
  });
  router.use(
    '/settings',
    authenticate,
    createSettingsRouter({ settingsController, settingsService }),
  );
  router.use('/files', authenticate, createFileRouter({ uploadController, uploadService }));

  router.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      uptimeSeconds: Math.round(process.uptime()),
      provider: config.ai.provider,
      timestamp: new Date().toISOString(),
    });
  });

  router.get('/health/ready', async (req, res) => {
    try {
      if (readinessCheck) {
        await readinessCheck();
      } else if (pool) {
        await pool.query('SELECT 1');
      } else {
        throw new Error('Database pool is not configured.');
      }
      res.status(200).json({ status: 'ready', timestamp: new Date().toISOString() });
    } catch (error) {
      logger.error(
        { requestId: req.id, errorCode: error?.code },
        'Readiness check failed',
      );
      res.status(503).json({
        status: 'not_ready',
        error: 'A required service is unavailable.',
        requestId: req.id,
        timestamp: new Date().toISOString(),
      });
    }
  });

  router.use(
    '/conversations',
    authenticate,
    createConversationsRouter({
      conversationController,
      conversationService,
      uploadController,
      uploadService,
    }),
  );
  router.use(
    '/',
    chatAuthMiddleware ?? authenticate,
    createChatRouter({
      chatController,
      chatService,
      rateLimiter,
      chatQuotaMiddleware,
      conversationService,
    }),
  );

  return router;
}

export default createApiRouter;