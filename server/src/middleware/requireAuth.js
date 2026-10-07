import ApiError from '../utils/ApiError.js';

export function requireAuth(req, _res, next) {
  if (!req.session?.userId) {
    return next(ApiError.unauthorized('AUTH_REQUIRED', 'Sign in to access this resource.'));
  }

  req.user = { id: req.session.userId };
  return next();
}

export default requireAuth;
