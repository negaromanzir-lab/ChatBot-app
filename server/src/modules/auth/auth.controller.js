import { promisify } from 'node:util';
import ApiError from '../../utils/ApiError.js';
import createAuthService from './auth.service.js';

export function createAuthController({ authService } = {}) {
  let service = authService;
  function getService() {
    service ??= createAuthService();
    return service;
  }

  async function register(req, res) {
    const user = await getService().register(req.body);
    await establishSession(req, user.id);
    res.status(201).json({ user });
  }

  async function login(req, res) {
    const user = await getService().login(req.body);
    await establishSession(req, user.id);
    res.status(200).json({ user });
  }

  async function currentUser(req, res) {
    if (!req.session?.userId) {
      throw ApiError.unauthorized('AUTH_REQUIRED', 'Sign in to continue.');
    }
    const user = await getService().findUserById(req.session.userId);
    if (!user) {
      req.session.destroy(() => {});
      throw ApiError.unauthorized('AUTH_REQUIRED', 'Sign in to continue.');
    }
    res.status(200).json({ user });
  }

  async function logout(req, res) {
    if (req.session) {
      await promisify(req.session.destroy).call(req.session);
    }
    res.clearCookie('chatbot.sid', {
      httpOnly: true,
      secure: req.secure,
      sameSite: 'lax',
    });
    res.status(204).end();
  }

  return { register, login, currentUser, logout };
}

async function establishSession(req, userId) {
  if (!req.session) {
    throw ApiError.internal('SESSION_UNAVAILABLE', 'Could not establish a user session.');
  }
  await promisify(req.session.regenerate).call(req.session);
  req.session.userId = userId;
  await promisify(req.session.save).call(req.session);
}

export default createAuthController;
