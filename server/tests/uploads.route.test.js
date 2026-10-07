// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';

let server;
let baseUrl;
let uploadService;
const user = {
  id: 'c0a80101-0000-4000-8000-000000000001',
  clerk_user_id: 'user_clerk_upload',
  email: 'owner@example.com',
};
const conversationId = 'c0a80101-0000-4000-8000-000000000002';
const uploadId = 'c0a80101-0000-4000-8000-000000000003';

async function startServer() {
  if (server) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  uploadService = {
    list: vi.fn().mockResolvedValue([]),
    upload: vi.fn().mockResolvedValue({
      id: uploadId,
      name: 'notes.txt',
      contentType: 'text/plain',
      size: 5,
    }),
    download: vi.fn().mockResolvedValue({
      upload: { id: uploadId, name: 'notes.txt', contentType: 'text/plain' },
      contents: Buffer.from('hello'),
    }),
    remove: vi.fn().mockResolvedValue(true),
  };
  const app = createApp({
    uploadService,
    authService: {
      findClerkUserById: vi.fn().mockResolvedValue({
        ...user,
        created_at: new Date(),
      }),
    },
    authResolver: (req) => req.auth ?? {},
    clerkAuthMiddleware: (req, _res, next) => {
      req.auth = req.get('authorization') === 'Bearer valid-token'
        ? { userId: user.clerk_user_id }
        : {};
      next();
    },
  });
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
}

async function send(path, { method = 'GET', headers = {}, body } = {}) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: { authorization: 'Bearer valid-token', ...headers },
    body,
  });
}

beforeEach(startServer);

afterAll(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

describe('conversation upload routes', () => {
  it('requires authentication for the top-level file upload endpoint', async () => {
    const response = await fetch(`${baseUrl}/api/files`, { method: 'POST' });
    expect(response.status).toBe(401);
    expect(uploadService.upload).not.toHaveBeenCalled();
  });

  it('requires the authenticated identity before listing conversation files', async () => {
    const response = await fetch(
      `${baseUrl}/api/conversations/${conversationId}/uploads`,
    );
    expect(response.status).toBe(401);
    expect(uploadService.list).not.toHaveBeenCalled();
  });

  it('accepts authenticated uploads at POST /api/files and binds them to a conversation', async () => {
    const formData = new FormData();
    formData.append('file', new Blob(['hello'], { type: 'text/plain' }), 'notes.txt');
    formData.append('conversationId', conversationId);

    const response = await send('/api/files', { method: 'POST', body: formData });

    expect(response.status).toBe(201);
    expect(uploadService.upload).toHaveBeenCalledWith(
      user.id,
      conversationId,
      expect.objectContaining({ originalname: 'notes.txt' }),
    );
  });

  it('rejects file uploads without a valid conversation before storing them', async () => {
    const formData = new FormData();
    formData.append('file', new Blob(['hello'], { type: 'text/plain' }), 'notes.txt');
    formData.append('conversationId', 'invalid');

    const response = await send('/api/files', { method: 'POST', body: formData });

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('INVALID_CONVERSATION_ID');
    expect(uploadService.upload).not.toHaveBeenCalled();
  });

  it('passes the authenticated database user to the upload service', async () => {
    const formData = new FormData();
    formData.append('file', new Blob(['hello'], { type: 'text/plain' }), 'notes.txt');

    const response = await send(
      `/api/conversations/${conversationId}/uploads`,
      { method: 'POST', body: formData },
    );

    expect(response.status).toBe(201);
    expect(uploadService.upload).toHaveBeenCalledWith(
      user.id,
      conversationId,
      expect.objectContaining({
        originalname: 'notes.txt',
        mimetype: 'text/plain',
        size: 5,
      }),
    );
  });

  it('rejects malformed IDs before accessing files', async () => {
    const response = await send('/api/conversations/not-a-uuid/uploads');

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('INVALID_CONVERSATION_ID');
    expect(uploadService.list).not.toHaveBeenCalled();
  });

  it('serves downloads as private attachments and delegates ownership checks', async () => {
    const response = await send(
      `/api/conversations/${conversationId}/uploads/${uploadId}`,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('content-disposition')).toContain('attachment');
    expect(await response.text()).toBe('hello');
    expect(uploadService.download).toHaveBeenCalledWith(user.id, conversationId, uploadId);
  });

  it('returns not found when the caller does not own the upload', async () => {
    uploadService.download.mockResolvedValueOnce(null);

    const response = await send(
      `/api/conversations/${conversationId}/uploads/${uploadId}`,
    );

    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe('UPLOAD_NOT_FOUND');
  });

  it('deletes an owned upload', async () => {
    const response = await send(
      `/api/conversations/${conversationId}/uploads/${uploadId}`,
      { method: 'DELETE' },
    );

    expect(response.status).toBe(204);
    expect(uploadService.remove).toHaveBeenCalledWith(user.id, conversationId, uploadId);
  });
});
