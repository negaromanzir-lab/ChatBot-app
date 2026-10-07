import bcrypt from 'bcryptjs';
import ApiError from '../../utils/ApiError.js';
import { createAuthRepository } from './auth.repository.js';

const BCRYPT_ROUNDS = 12;

export function createAuthService({ repository = createAuthRepository() } = {}) {
  async function register({ email, password }) {
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    try {
      const user = await repository.createUser({ email, passwordHash });
      return publicUser(user);
    } catch (error) {
      if (error.code === '23505') {
        throw ApiError.badRequest('EMAIL_IN_USE', 'An account with this email already exists.');
      }
      throw error;
    }
  }

  async function login({ email, password }) {
    const user = await repository.findUserByEmail(email);
    const matches = user ? await bcrypt.compare(password, user.password_hash) : false;
    if (!matches) {
      throw ApiError.unauthorized('INVALID_CREDENTIALS', 'Email or password is incorrect.');
    }
    return publicUser(user);
  }

  async function findUserById(id) {
    const user = await repository.findUserById(id);
    return user ? publicUser(user) : null;
  }

  return { register, login, findUserById };
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    createdAt: user.created_at,
  };
}

export default createAuthService;
