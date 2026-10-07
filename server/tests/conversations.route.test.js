// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';

let server;
let baseUrl;
let conversationService;
let authService;
let clerkClient;

const testUser = {
  id: 'c0a80101-0000-4000-8000-000000000001',
  clerk_user_id: 'user_clerk_owner',
  email: 'owner@example.com',
  created_at: new Date('2026-01-01T00:00:00.000Z'),
};

async function startServer() {
  if (server) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }

  authService = {
    findClerkUserById: vi.fn(async (clerkUserId) =>
      clerkUserId === testUser.clerk_user_id ? testUser : null,
    ),
    syncClerkUser: vi.fn().mockResolvedValue(testUser),
  };
  clerkClient = {
    users: {
      getUser: vi.fn().mockResolvedValue({
        id: testUser.clerk_user_id,
        primaryEmailAddressId: 'email-1',
        emailAddresses: [{
          id: 'email-1',
          emailAddress: testUser.email,
          verification: { status: 'verified' },
        }],
      }),
    },
  };
  conversationService = {
    create: vi.fn().mockResolvedValue({
      id: 'c0a80101-0000-4000-8000-000000000002',
      userId: testUser.id,
      title: 'New chat',
    }),
    list: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(null),
    rename: vi.fn().mockResolvedValue(null),
    remove: vi.fn().mockResolvedValue(false),
    addMessage: vi.fn().mockResolvedValue(null),
  };

  const app = createApp({
    authService,
    clerkClient,
    authResolver: (req) => req.auth,
    conversationService,
    clerkAuthMiddleware: (req, _res, next) => {
      req.auth = req.get('authorization') === 'Bearer valid-clerk-token'
        ? { userId: testUser.clerk_user_id }
        : {};
      next();
    },
  });
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
}

async function request(path, {
  method = 'GET',
  body,
  authenticated = true,
} = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(authenticated ? { authorization: 'Bearer valid-clerk-token' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return response;
}

beforeEach(startServer);

afterAll(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

describe('Clerk authentication and conversation ownership', () => {
  it('rejects requests without a verified Clerk identity', async () => {
    const response = await request('/api/conversations', { authenticated: false });
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe('AUTH_REQUIRED');
  });

  it('synchronizes an authenticated Clerk identity when no local user exists', async () => {
    authService.findClerkUserById.mockResolvedValueOnce(null);

    const response = await request('/api/conversations');

    expect(response.status).toBe(200);
    expect(clerkClient.users.getUser).toHaveBeenCalledWith(testUser.clerk_user_id);
    expect(authService.syncClerkUser).toHaveBeenCalledWith({
      clerkUserId: testUser.clerk_user_id,
      email: testUser.email,
    });
    expect(conversationService.list).toHaveBeenCalledWith(testUser.id);
  });

  it('does not synchronize accounts using an unverified email address', async () => {
    authService.findClerkUserById.mockResolvedValueOnce(null);
    clerkClient.users.getUser.mockResolvedValueOnce({
      id: testUser.clerk_user_id,
      primaryEmailAddressId: 'email-1',
      emailAddresses: [{
        id: 'email-1',
        emailAddress: testUser.email,
        verification: { status: 'unverified' },
      }],
    });

    const response = await request('/api/conversations');

    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe('VERIFIED_EMAIL_REQUIRED');
    expect(authService.syncClerkUser).not.toHaveBeenCalled();
    expect(conversationService.list).not.toHaveBeenCalled();
  });

  it('creates, renames, and deletes only with the database user for the verified Clerk identity', async () => {
    const conversation = {
      id: 'c0a80101-0000-4000-8000-000000000002',
      userId: testUser.id,
      title: 'A useful title',
    };
    conversationService.create.mockResolvedValueOnce(conversation);
    conversationService.rename.mockResolvedValueOnce(conversation);
    conversationService.remove.mockResolvedValueOnce(true);

    const created = await request('/api/conversations', {
      method: 'POST',
      body: { user_id: 'attacker-user-id' },
    });
    expect(created.status).toBe(201);
    expect(conversationService.create).toHaveBeenCalledWith(testUser.id, {});

    const renamed = await request(`/api/conversations/${conversation.id}`, {
      method: 'PATCH',
      body: { title: 'A useful title', user_id: 'attacker-user-id' },
    });
    expect(renamed.status).toBe(200);
    expect(conversationService.rename).toHaveBeenCalledWith(
      testUser.id,
      conversation.id,
      'A useful title',
    );

    const deleted = await request(`/api/conversations/${conversation.id}`, {
      method: 'DELETE',
    });
    expect(deleted.status).toBe(204);
    expect(conversationService.remove).toHaveBeenCalledWith(testUser.id, conversation.id);
  });

  it('hides conversations owned by another account', async () => {
    const foreignId = 'c0a80101-0000-4000-8000-000000000099';
    conversationService.get.mockResolvedValueOnce(null);

    const response = await request(`/api/conversations/${foreignId}`);

    expect(response.status).toBe(404);
    expect(conversationService.get).toHaveBeenCalledWith(testUser.id, foreignId);
  });

  it('persists messages through the authenticated user identity', async () => {
    const conversationId = 'c0a80101-0000-4000-8000-000000000002';
    conversationService.addMessage.mockResolvedValueOnce({
      conversation: { id: conversationId, title: 'What is PostgreSQL?' },
      message: {
        id: 'c0a80101-0000-4000-8000-000000000003',
        conversationId,
        role: 'user',
        content: 'What is PostgreSQL?',
      },
    });

    const response = await request(`/api/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: { role: 'user', content: 'What is PostgreSQL?', user_id: 'attacker-user-id' },
    });

    expect(response.status).toBe(201);
    expect(conversationService.addMessage).toHaveBeenCalledWith(
      testUser.id,
      conversationId,
      { role: 'user', content: 'What is PostgreSQL?' },
    );
    expect((await response.json()).conversation.title).toBe('What is PostgreSQL?');
  });
});
