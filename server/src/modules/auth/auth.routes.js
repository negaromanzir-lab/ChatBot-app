import { Router } from 'express';
import { z } from 'zod';
import validate from '../../middleware/validate.js';
import { createAuthRateLimiter } from '../../middleware/rateLimit.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { createAuthController } from './auth.controller.js';

const credentialsSchema = z.object({
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
  password: z
    .string()
    .min(12, 'Password must contain at least 12 characters.')
    .refine((password) => Buffer.byteLength(password, 'utf8') <= 72, {
      message: 'Password must be 72 bytes or fewer.',
    }),
});

export function createAuthRouter({ authController, authService, rateLimiter } = {}) {
  const router = Router();
  const controller = authController ?? createAuthController({ authService });
  const limiter = rateLimiter ?? createAuthRateLimiter();

  router.post(
    '/register',
    limiter,
    validate({ body: credentialsSchema }),
    asyncHandler(controller.register),
  );
  router.post(
    '/login',
    limiter,
    validate({ body: credentialsSchema }),
    asyncHandler(controller.login),
  );
  router.get('/me', asyncHandler(controller.currentUser));
  router.post('/logout', asyncHandler(controller.logout));

  return router;
}

export default createAuthRouter;
