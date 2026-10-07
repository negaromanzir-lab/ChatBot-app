import { Router } from 'express';
import multer from 'multer';
import config from '../../config/env.js';
import ApiError from '../../utils/ApiError.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { createUploadController } from './upload.controller.js';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createFileRouter({ uploadController, uploadService } = {}) {
  const router = Router();
  const controller = uploadController ?? createUploadController({ uploadService });
  const parser = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: config.uploads.maxSizeBytes,
      files: 1,
      fields: 1,
      parts: 2,
      fieldSize: 64,
    },
  }).single('file');

  router.post(
    '/',
    (req, res, next) => {
      parser(req, res, (error) => {
        if (!error) return next();
        if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
          return next(ApiError.payloadTooLarge(
            'UPLOAD_TOO_LARGE',
            `Files must be ${Math.floor(config.uploads.maxSizeBytes / (1024 * 1024))} MB or smaller.`,
          ));
        }
        if (error instanceof multer.MulterError) {
          return next(ApiError.badRequest('INVALID_UPLOAD', 'Upload one file and its conversationId.'));
        }
        return next(error);
      });
    },
    (req, _res, next) => {
      if (!UUID_PATTERN.test(req.body?.conversationId ?? '')) {
        return next(ApiError.badRequest(
          'INVALID_CONVERSATION_ID',
          'conversationId must be a UUID.',
        ));
      }
      return next();
    },
    asyncHandler(controller.upload),
  );

  return router;
}

export default createFileRouter;
