import { Router } from 'express';
import multer from 'multer';
import config from '../../config/env.js';
import ApiError from '../../utils/ApiError.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { createUploadController } from './upload.controller.js';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const multipartUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.uploads.maxSizeBytes,
    files: 1,
    fields: 0,
    parts: 1,
  },
}).single('file');

function validateIds(req, _res, next) {
  if (!UUID_PATTERN.test(req.params.id)) {
    return next(ApiError.badRequest('INVALID_CONVERSATION_ID', 'Conversation id must be a UUID.'));
  }
  if (req.params.uploadId && !UUID_PATTERN.test(req.params.uploadId)) {
    return next(ApiError.badRequest('INVALID_UPLOAD_ID', 'Upload id must be a UUID.'));
  }
  return next();
}

function parseUpload(req, _res, next) {
  multipartUpload(req, _res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return next(
        ApiError.payloadTooLarge(
          'UPLOAD_TOO_LARGE',
          `Files must be ${Math.floor(config.uploads.maxSizeBytes / (1024 * 1024))} MB or smaller.`,
        ),
      );
    }
    if (error instanceof multer.MulterError) {
      return next(ApiError.badRequest('INVALID_UPLOAD', 'Upload one file using the "file" field.'));
    }
    return next(error);
  });
}

export function createUploadRouter({ uploadController, uploadService } = {}) {
  const router = Router({ mergeParams: true });
  const controller =
    uploadController ?? createUploadController({ uploadService });

  router.use(validateIds);
  router.get('/', asyncHandler(controller.list));
  router.post('/', parseUpload, asyncHandler(controller.upload));
  router.get('/:uploadId', asyncHandler(controller.download));
  router.delete('/:uploadId', asyncHandler(controller.remove));
  return router;
}

export default createUploadRouter;
