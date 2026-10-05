import config from '../config/env.js';
import logger from '../config/logger.js';
import ApiError from '../utils/ApiError.js';

/** Terminal 404 for unmatched routes. */
export function notFoundHandler(req, _res, next) {
  next(
    new ApiError(404, 'NOT_FOUND', `Route ${req.method} ${req.originalUrl} does not exist.`),
  );
}

/**
 * Central error handler. Must keep all four parameters for Express to treat it
 * as an error middleware.
 *
 * Two rules drive the shape of every response:
 *   1. Known, operational failures return their message and machine code.
 *   2. Everything else returns a generic message. Unexpected errors are logged
 *      with their stack server-side and never described to the client, so an
 *      internal message or file path cannot leak through an error response.
 */
export function errorHandler(err, req, res, _next) {
  const requestId = req.id;

  let statusCode = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'An unexpected error occurred.';
  let details;

  if (err instanceof ApiError) {
    statusCode = err.statusCode;
    code = err.code;
    message = err.message;
    details = err.details;
  } else if (err?.type === 'entity.parse.failed') {
    statusCode = 400;
    code = 'INVALID_JSON';
    message = 'The request body is not valid JSON.';
  } else if (err?.type === 'entity.too.large') {
    statusCode = 413;
    code = 'PAYLOAD_TOO_LARGE';
    message = `The request body exceeds the ${config.bodyLimit} limit.`;
  } else if (err?.status === 400) {
    statusCode = 400;
    code = 'BAD_REQUEST';
    message = 'The request could not be processed.';
  } else if (err?.type === 'encoding.unsupported') {
    statusCode = 415;
    code = 'UNSUPPORTED_MEDIA_TYPE';
    message = 'The request content type is not supported.';
  }

  const logPayload = { err, requestId, method: req.method, path: req.originalUrl };

  if (statusCode >= 500) {
    logger.error(logPayload, 'Request failed');
  } else {
    logger.warn({ ...logPayload, code }, 'Request rejected');
  }

  const body = {
    error: {
      code,
      message,
      requestId,
    },
  };

  if (details) {
    body.error.details = details;
  }

  // Expose the real stack only outside production, and only for genuine
  // server-side faults. Client mistakes (bad JSON, bad payload) are already
  // described by `message`, and echoing a stack there leaks absolute paths for
  // no debugging benefit.
  if (config.env === 'development' && statusCode >= 500 && !(err instanceof ApiError)) {
    body.error.stack = err?.stack;
  }

  res.status(statusCode).json(body);
}

export default errorHandler;