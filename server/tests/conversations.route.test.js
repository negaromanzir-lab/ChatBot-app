// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';

let server;
let baseUrl;
let conversationService;
let authService;

const testUser = {
  id: 'c0a80101-0000-4000-8000-000000000001',
  email: 'owner@example.com',
  created_at: new Date('2026-01-01T00:00:00.000Z'),
};

async function startServer() {
  if (server) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }

  authService = {
    register: vi.fn().mockResolvedValue({
      id: testUser.id,
      email: testUser.email,
      createdAt: testUser.created_at,
    }),
    login: vi.fn().mockResolvedValue({
      id: testUser.id,
      email: testUser.email,
      createdAt: testUser.created_at,
    }),
    findUserById: vi.fn().mockResolvedValue({
      id: testUser.id,
      email: testUser.email,
      createdAt: testUser.created_at,
    }),
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
    conversationService,
    chatAuthMiddleware: (_req, _res, next) => next(),
  });
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
}

async function request(path, { method = 'GET', body, cookie } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return response;
}

async function signIn() {
  const response = await request('/api/auth/login', {
    method: 'POST',
    body: { email: testUser.email, password: 'a-secure-test-password' },
  });
  expect(response.status).toBe(200);
  return response.headers.get('set-cookie').split(';')[0];
}

beforeEach(startServer);

afterAll(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

describe('authentication and conversation ownership', () => {
  it('rejects unauthenticated conversation access', async () => {
    const response = await request('/api/conversations');
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe('AUTH_REQUIRED');
  });

  it('creates a session after login and scopes the conversation list to that user', async () => {
    const cookie = await signIn();
    const response = await request('/api/conversations', { cookie });

    expect(response.status).toBe(200);
    expect(conversationService.list).toHaveBeenCalledWith(testUser.id);
  });

  it('creates, renames, and deletes only with the authenticated user id', async () => {
    const cookie = await signIn();
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
      cookie,
      body: {},
    });
    expect(created.status).toBe(201);
    expect(conversationService.create).toHaveBeenCalledWith(testUser.id, {});

    const renamed = await request(`/api/conversations/${conversation.id}`, {
      method: 'PATCH',
      cookie,
      body: { title: 'A useful title' },
    });
    expect(renamed.status).toBe(200);
    expect(conversationService.rename).toHaveBeenCalledWith(
      testUser.id,
      conversation.id,
      'A useful title',
    );

    const deleted = await request(`/api/conversations/${conversation.id}`, {
      method: 'DELETE',
      cookie,
    });
    expect(deleted.status).toBe(204);
    expect(conversationService.remove).toHaveBeenCalledWith(testUser.id, conversation.id);
  });

  it('hides conversations owned by another account', async () => {
    const cookie = await signIn();
    const foreignId = 'c0a80101-0000-4000-8000-000000000099';
    conversationService.get.mockResolvedValueOnce(null);

    const response = await request(`/api/conversations/${foreignId}`, { cookie });

    expect(response.status).toBe(404);
    expect(conversationService.get).toHaveBeenCalledWith(testUser.id, foreignId);
  });

  it('persists messages through the authenticated message endpoint', async () => {
    const cookie = await signIn();
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
      cookie,
      body: { role: 'user', content: 'What is PostgreSQL?' },
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
