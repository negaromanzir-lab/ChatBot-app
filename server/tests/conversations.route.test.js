// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';

let server;
let baseUrl;
let conversationService;
let authService;
let clerkClient;
let settingsService;

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
    setArchived: vi.fn().mockResolvedValue(null),
    remove: vi.fn().mockResolvedValue(false),
    addMessage: vi.fn().mockResolvedValue(null),
    updateUserMessage: vi.fn().mockResolvedValue(null),
  };
  settingsService = {
    get: vi.fn().mockResolvedValue({
      theme: 'system',
      displayName: null,
      selectedModelId: null,
    }),
    update: vi.fn(async (_userId, patch) => ({
      theme: patch.theme ?? 'system',
      displayName: patch.displayName ?? null,
      selectedModelId: patch.selectedModelId ?? null,
    })),
  };

  const app = createApp({
    authService,
    clerkClient,
    authResolver: (req) => req.auth,
    conversationService,
    settingsService,
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

  it('reads settings only for the authenticated database user', async () => {
    const response = await request('/api/settings');

    expect(response.status).toBe(200);
    expect(settingsService.get).toHaveBeenCalledWith(testUser.id);
    expect(await response.json()).toMatchObject({
      settings: { theme: 'system', selectedModelId: null },
    });
  });

  it('updates allowlisted settings for the authenticated account, ignoring supplied owner IDs', async () => {
    const response = await request('/api/settings', {
      method: 'PATCH',
      body: { theme: 'dark', selectedModelId: 'openai-default', userId: 'other-user' },
    });

    expect(response.status).toBe(200);
    expect(settingsService.update).toHaveBeenCalledWith(testUser.id, {
      theme: 'dark',
      selectedModelId: 'openai-default',
    });
  });

  it('validates settings values and rejects an empty update', async () => {
    const invalidTheme = await request('/api/settings', {
      method: 'PATCH',
      body: { theme: 'neon' },
    });
    expect(invalidTheme.status).toBe(400);
    expect(settingsService.update).not.toHaveBeenCalled();

    const emptyUpdate = await request('/api/settings', {
      method: 'PATCH',
      body: {},
    });
    expect(emptyUpdate.status).toBe(400);
    expect(settingsService.update).not.toHaveBeenCalled();
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
    expect(conversationService.list).toHaveBeenCalledWith(testUser.id, {
      includeArchived: false,
    });
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

  it('updates an owned user message through the authenticated identity', async () => {
    const conversationId = 'c0a80101-0000-4000-8000-000000000002';
    const messageId = 'c0a80101-0000-4000-8000-000000000003';
    conversationService.updateUserMessage.mockResolvedValueOnce({
      conversation: { id: conversationId, title: 'Edited title' },
      message: { id: messageId, conversationId, role: 'user', content: 'Edited prompt' },
    });

    const response = await request(
      `/api/conversations/${conversationId}/messages/${messageId}`,
      { method: 'PATCH', body: { content: 'Edited prompt', user_id: 'attacker' } },
    );

    expect(response.status).toBe(200);
    expect(conversationService.updateUserMessage).toHaveBeenCalledWith(
      testUser.id,
      conversationId,
      messageId,
      { content: 'Edited prompt' },
    );
    expect((await response.json()).message.content).toBe('Edited prompt');
  });

  it('lists archived conversations only when asked', async () => {
    const response = await request('/api/conversations?includeArchived=true');

    expect(response.status).toBe(200);
    expect(conversationService.list).toHaveBeenCalledWith(testUser.id, {
      includeArchived: true,
    });
  });

  it('archives and unarchives an owned conversation through the authenticated identity', async () => {
    const conversationId = 'c0a80101-0000-4000-8000-000000000002';
    conversationService.setArchived.mockResolvedValueOnce({
      id: conversationId,
      title: 'A useful title',
      archivedAt: '2026-01-02T00:00:00.000Z',
    });

    const archived = await request(`/api/conversations/${conversationId}/archive`, {
      method: 'POST',
    });
    expect(archived.status).toBe(200);
    expect(conversationService.setArchived).toHaveBeenCalledWith(
      testUser.id,
      conversationId,
      true,
    );
    expect((await archived.json()).conversation.archivedAt).toBe(
      '2026-01-02T00:00:00.000Z',
    );

    conversationService.setArchived.mockResolvedValueOnce({
      id: conversationId,
      title: 'A useful title',
      archivedAt: null,
    });
    const unarchived = await request(`/api/conversations/${conversationId}/unarchive`, {
      method: 'POST',
    });
    expect(unarchived.status).toBe(200);
    expect(conversationService.setArchived).toHaveBeenLastCalledWith(
      testUser.id,
      conversationId,
      false,
    );
  });

  it('returns not found when archiving a conversation the user does not own', async () => {
    const foreignId = 'c0a80101-0000-4000-8000-000000000099';
    conversationService.setArchived.mockResolvedValueOnce(null);

    const response = await request(`/api/conversations/${foreignId}/archive`, {
      method: 'POST',
    });
    expect(response.status).toBe(404);
    expect(conversationService.setArchived).toHaveBeenCalledWith(
      testUser.id,
      foreignId,
      true,
    );
  });
});
