import { Router } from 'express';
import { z } from 'zod';
import validate from '../middleware/validate.js';
import { createChatRateLimiter } from '../middleware/rateLimit.js';
import asyncHandler from '../utils/asyncHandler.js';
import config from '../config/env.js';
import { createChatController } from '../controllers/chat.controller.js';

/**
 * Request contract for POST /api/chat.
 *
 * `role` is constrained to the two values the model API understands, and length
 * limits come from config so they can be tuned without touching code. Enforcing
 * this server-side is the point: the frontend is not a trust boundary.
 */
export const chatRequestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant'], {
          message: 'role must be either "user" or "assistant"',
        }),
        content: z
          .string({ message: 'content must be a string' })
          .min(1, 'content must not be empty')
          .max(config.limits.maxContentLength),
      }),
    )
    .min(1, 'messages must contain at least one message')
    .max(config.limits.maxMessages, `messages must contain at most ${config.limits.maxMessages} messages`),
});

export function createChatRouter({ chatController, chatService, rateLimiter } = {}) {
  const router = Router();
  const controller = chatController ?? createChatController({ chatService });
  const limiter = rateLimiter ?? createChatRateLimiter();

  router.post('/chat', limiter, validate({ body: chatRequestSchema }), asyncHandler(controller.sendMessage));

  return router;
}

export default createChatRouter;