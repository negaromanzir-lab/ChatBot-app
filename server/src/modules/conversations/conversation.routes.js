import { Router } from 'express';
import { z } from 'zod';
import validate from '../../middleware/validate.js';
import ApiError from '../../utils/ApiError.js';
import asyncHandler from '../../utils/asyncHandler.js';
import config from '../../config/env.js';
import { createConversationController } from './conversation.controller.js';
import { createUploadRouter } from '../uploads/upload.routes.js';

const idSchema = z.string().uuid();
const messageIdSchema = z.string().uuid();
const createSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
});
const renameSchema = z.object({
  title: z.string().trim().min(1).max(200),
});
const messageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().trim().min(1).max(config.limits.maxContentLength),
});

function validateId(req, _res, next) {
  const parsed = idSchema.safeParse(req.params.id);
  if (!parsed.success) {
    return next(
      ApiError.badRequest(
        'INVALID_CONVERSATION_ID',
        'Conversation id must be a UUID.',
      ),
    );
  }
  return next();
}

export function createConversationsRouter({
  conversationController,
  conversationService,
  uploadController,
  uploadService,
} = {}) {
  const router = Router();
  const controller =
    conversationController ?? createConversationController({ conversationService });

  router.use(
    '/:id/uploads',
    createUploadRouter({ uploadController, uploadService }),
  );
  router.post('/', validate({ body: createSchema }), asyncHandler(controller.create));
  router.get('/', asyncHandler(controller.list));
  router.get('/:id', validateId, asyncHandler(controller.get));
  router.patch(
    '/:id',
    validateId,
    validate({ body: renameSchema }),
    asyncHandler(controller.rename),
  );
  router.delete('/:id', validateId, asyncHandler(controller.remove));
  router.post(
    '/:id/messages',
    validateId,
    validate({ body: messageSchema }),
    asyncHandler(controller.addMessage),
  );
  router.patch(
    '/:id/messages/:messageId',
    validateId,
    (req, _res, next) => {
      const parsed = messageIdSchema.safeParse(req.params.messageId);
      if (!parsed.success) {
        return next(ApiError.badRequest('INVALID_MESSAGE_ID', 'Message id must be a UUID.'));
      }
      return next();
    },
    validate({ body: z.object({
      content: z.string().trim().min(1).max(config.limits.maxContentLength),
    }) }),
    asyncHandler(controller.updateMessage),
  );

  return router;
}

export default createConversationsRouter;
