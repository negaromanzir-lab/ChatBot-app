import config from '../config/env.js';
import ApiError from '../utils/ApiError.js';

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

export function verifyOrigin(req, _res, next) {
  const origin = req.get('origin');
  if (
    MUTATING_METHODS.has(req.method) &&
    origin &&
    !config.corsOrigins.includes(origin)
  ) {
    return next(
      ApiError.forbidden(
        'ORIGIN_NOT_ALLOWED',
        'This request origin is not allowed.',
      ),
    );
  }
  return next();
}

export default verifyOrigin;
