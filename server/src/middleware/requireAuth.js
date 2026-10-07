import { clerkClient as defaultClerkClient, getAuth } from '@clerk/express';
import ApiError from '../utils/ApiError.js';
import { createAuthService } from '../modules/auth/auth.service.js';

export function createRequireAuth({
  authService,
  clerkClient = defaultClerkClient,
  authResolver = getAuth,
} = {}) {
  let service = authService;
  function getService() {
    service ??= createAuthService();
    return service;
  }

  return async function requireAuth(req, _res, next) {
    try {
      const auth = authResolver(req);
      if (!auth.userId) {
        throw ApiError.unauthorized('AUTH_REQUIRED', 'Sign in to access this resource.');
      }

      let user = await getService().findClerkUserById(auth.userId);
      if (!user) {
        const clerkUser = await clerkClient.users.getUser(auth.userId);
        const primaryEmail = clerkUser.emailAddresses.find(
          ({ id }) => id === clerkUser.primaryEmailAddressId,
        );
        if (!primaryEmail || primaryEmail.verification?.status !== 'verified') {
          throw ApiError.forbidden(
            'VERIFIED_EMAIL_REQUIRED',
            'A verified email address is required for this account.',
          );
        }
        user = await getService().syncClerkUser({
          clerkUserId: auth.userId,
          email: primaryEmail.emailAddress,
        });
      }

      req.user = {
        id: user.id,
        clerkUserId: user.clerk_user_id ?? auth.userId,
        email: user.email,
      };
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

export default createRequireAuth;
