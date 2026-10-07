import ApiError from '../../utils/ApiError.js';
import { createAuthRepository } from './auth.repository.js';

export function createAuthService({ repository = createAuthRepository() } = {}) {
  async function findClerkUserById(clerkUserId) {
    return repository.findClerkUserById(clerkUserId);
  }

  async function syncClerkUser({ clerkUserId, email }) {
    if (!email || !clerkUserId) {
      throw ApiError.forbidden(
        'VERIFIED_EMAIL_REQUIRED',
        'A verified email address is required for this account.',
      );
    }
    try {
      return await repository.syncClerkUser({ clerkUserId, email: email.toLowerCase() });
    } catch (error) {
      if (error.code === 'CLERK_IDENTITY_CONFLICT') {
        throw ApiError.conflict(
          'ACCOUNT_LINK_CONFLICT',
          'This email is linked to a different sign-in identity.',
        );
      }
      throw error;
    }
  }

  return { findClerkUserById, syncClerkUser };
}

export default createAuthService;
