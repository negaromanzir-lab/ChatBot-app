import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import config from '../config/env.js';
import ApiError from '../utils/ApiError.js';

/**
 * Rate limiting for the AI endpoint.
 *
 * `ipKeyGenerator` is used instead of a raw `req.ip` because every caller in
 * this project is unauthenticated — there is no user id to key on yet. That
 * makes the limit per-IP, which is the right trade-off before Phase 5 adds
 * authentication and per-account quotas.
 */
export function createChatRateLimiter(overrides = {}) {
  return rateLimit({
    windowMs: overrides.windowMs ?? config.rateLimit.windowMs,
    limit: overrides.limit ?? config.rateLimit.max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => ipKeyGenerator(req.ip),
    // Rate limits are per-IP and therefore inherently shared behind a NAT or
    // proxy; skipping aborted requests avoids penalising clients that
    // disconnect mid-request.
    skip: (req) => req.method === 'OPTIONS',
    handler: (_req, _res, next) => {
      next(
        ApiError.tooManyRequests(
          'RATE_LIMIT_EXCEEDED',
          'Too many requests. Please wait a moment and try again.',
        ),
      );
    },
  });
}

export default createChatRateLimiter;