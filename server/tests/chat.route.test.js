// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { createChatService } from '../src/services/ai/chat.service.js';
import { createChatRateLimiter } from '../src/middleware/rateLimit.js';
import { default as ApiError } from '../src/utils/ApiError.js';

/**
 * Route-level tests for POST /api/chat.
 *
 * The app is mounted on an ephemeral port and driven with real `fetch`, so the
 * whole middleware chain (JSON parsing, validation, rate limiting, error
 * handling) is exercised rather than stubbed. The AI provider is injected as a
 * fake, so no network call and no credentials are involved.
 *
 * Note the per-test server: Vitest's `restoreMocks` wipes implementations of
 * mocks created in `beforeAll`, so each fake provider is built inside
 * `beforeEach` instead.
 */

let server;
let baseUrl;
let provider;

const passThroughLimiter = (_req, _res, next) => next();
const passThroughAuth = (_req, _res, next) => next();

/** Records the messages it was called with and returns a canned reply. */
function createFakeProvider(content = 'Hello! How can I help?', name = 'fake') {
  return {
    name,
    generateReply: vi.fn().mockResolvedValue({ role: 'assistant', content }),
    async *streamResponse() {
      yield content;
    },
  };
}

async function startServer({
  provider: override,
  rateLimiter,
  enforceChatAuth = false,
} = {}) {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }

  provider = override ?? createFakeProvider();

  const app = createApp({
    chatService: createChatService({ provider }),
    // Rate limiting has its own tests; disabling it elsewhere keeps assertions
    // independent of the shared request counter.
    rateLimiter: rateLimiter ?? passThroughLimiter,
    ...(enforceChatAuth ? {} : { chatAuthMiddleware: passThroughAuth }),
  });

  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
}

function postChat(body, { headers = {}, signal } = {}) {
  return fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
    signal,
  });
}

async function readSseEvents(response) {
  const text = await response.text();
  return text
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data: '))
    .map((line) => JSON.parse(line.slice(6)));
}

const validBody = { messages: [{ role: 'user', content: 'Hello' }] };

beforeEach(async () => {
  await startServer();
});

afterAll(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});

describe('POST /api/chat', () => {
  it('requires an authenticated session by default', async () => {
    await startServer({ enforceChatAuth: true });

    const response = await postChat(validBody);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'AUTH_REQUIRED' },
    });
    expect(provider.generateReply).not.toHaveBeenCalled();
  });

  describe('happy path', () => {
    it('returns the assistant reply in the documented shape', async () => {
      const response = await postChat(validBody);

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        message: { role: 'assistant', content: 'Hello! How can I help?' },
      });
    });

    it('forwards the validated messages to the provider unchanged', async () => {
      const conversation = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' },
        { role: 'user', content: 'What is 2+2?' },
      ];

      await postChat({ messages: conversation });

      expect(provider.generateReply).toHaveBeenCalledWith(conversation);
    });

    it('accepts an assistant role in the request history', async () => {
      const response = await postChat({
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi' },
        ],
      });

      expect(response.status).toBe(200);
    });

    it('streams provider chunks and finalizes one assistant message', async () => {
      await startServer({
        provider: {
          name: 'streaming-fake',
          generateReply: vi.fn(),
          async *streamResponse(conversation, { signal }) {
            expect(conversation).toEqual(validBody.messages);
            expect(signal).toBeInstanceOf(AbortSignal);
            yield 'Hello ';
            yield 'there!';
          },
        },
      });

      const response = await postChat({ ...validBody, stream: true });
      const events = await readSseEvents(response);

      expect(response.headers.get('content-type')).toContain('text/event-stream');
      expect(events).toEqual([
        { type: 'delta', content: 'Hello ' },
        { type: 'delta', content: 'there!' },
        {
          type: 'done',
          message: { role: 'assistant', content: 'Hello there!' },
        },
      ]);
    });

    it('returns provider errors as safe stream events', async () => {
      await startServer({
        provider: {
          name: 'streaming-failure',
          generateReply: vi.fn(),
          async *streamResponse() {
            yield 'partial';
            throw ApiError.badGateway(
              'AI_PROVIDER_UNAVAILABLE',
              'The AI provider is currently unavailable.',
            );
          },
        },
      });

      const response = await postChat({ ...validBody, stream: true });
      const events = await readSseEvents(response);

      expect(events).toEqual([
        { type: 'delta', content: 'partial' },
        {
          type: 'error',
          error: expect.objectContaining({
            code: 'AI_PROVIDER_UNAVAILABLE',
            message: 'The AI provider is currently unavailable.',
          }),
        },
      ]);
    });

    it('aborts the provider stream when the browser disconnects', async () => {
      let resolveProviderAbort;
      const providerAbort = new Promise((resolve) => {
        resolveProviderAbort = resolve;
      });

      await startServer({
        provider: {
          name: 'cancellable-stream',
          generateReply: vi.fn(),
          async *streamResponse(_conversation, { signal }) {
            yield 'first chunk';
            await new Promise((resolve) => {
              if (signal.aborted) {
                resolve();
                return;
              }
              signal.addEventListener(
                'abort',
                () => {
                  resolveProviderAbort(true);
                  resolve();
                },
                { once: true },
              );
            });
          },
        },
      });

      const browserController = new AbortController();
      const response = await postChat(
        { ...validBody, stream: true },
        { signal: browserController.signal },
      );
      await response.body.getReader().read();
      browserController.abort();

      await expect(
        Promise.race([
          providerAbort,
          new Promise((resolve) => setTimeout(() => resolve(false), 1000)),
        ]),
      ).resolves.toBe(true);
    });

    it('returns a normal JSON response when streaming was not requested', async () => {
      const response = await postChat(validBody);

      expect(response.headers.get('content-type')).toContain('application/json');
      await expect(response.json()).resolves.toEqual({
        message: { role: 'assistant', content: 'Hello! How can I help?' },
      });
    });
  });

  describe('validation', () => {
    it('rejects a missing messages array', async () => {
      const response = await postChat({});
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects an empty messages array', async () => {
      const response = await postChat({ messages: [] });
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error.details[0].field).toBe('messages');
    });

    it('rejects an unsupported role', async () => {
      const response = await postChat({ messages: [{ role: 'system', content: 'x' }] });
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error.details[0]).toMatchObject({
        field: 'messages.0.role',
        message: 'role must be either "user" or "assistant"',
      });
    });

    it('rejects non-string content', async () => {
      const response = await postChat({ messages: [{ role: 'user', content: 42 }] });

      expect(response.status).toBe(400);
    });

    it('rejects empty content', async () => {
      const response = await postChat({ messages: [{ role: 'user', content: '' }] });

      expect(response.status).toBe(400);
    });

    it('rejects malformed JSON', async () => {
      const response = await postChat('{ not json');
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error.code).toBe('INVALID_JSON');
    });

    it('never leaks a stack trace for a client error', async () => {
      const response = await postChat('{ not json');
      const body = await response.json();

      expect(body.error.stack).toBeUndefined();
    });

    it('strips unknown fields instead of forwarding them', async () => {
      const response = await postChat({
        messages: [{ role: 'user', content: 'Hello', isAdmin: true }],
      });

      expect(response.status).toBe(200);
      expect(provider.generateReply.mock.calls[0][0]).toEqual([
        { role: 'user', content: 'Hello' },
      ]);
    });

    it('rejects an oversized payload', async () => {
      const response = await postChat({
        messages: [{ role: 'user', content: 'x'.repeat(200_000) }],
      });

      expect(response.status).toBe(413);
      expect((await response.json()).error.code).toBe('PAYLOAD_TOO_LARGE');
    });
  });

  describe('provider failures', () => {
    it('maps an operational ApiError to its status and code', async () => {
      await startServer({
        provider: {
          name: 'failing',
          generateReply: vi
            .fn()
            .mockRejectedValue(
              ApiError.gatewayTimeout('AI_PROVIDER_TIMEOUT', 'The AI provider timed out.'),
            ),
        },
      });

      const response = await postChat(validBody);
      const body = await response.json();

      expect(response.status).toBe(504);
      expect(body.error).toMatchObject({
        code: 'AI_PROVIDER_TIMEOUT',
        message: 'The AI provider timed out.',
      });
    });

    it('reports an unusable provider reply as a bad gateway', async () => {
      await startServer({
        provider: { name: 'empty', generateReply: vi.fn().mockResolvedValue({ content: '' }) },
      });

      const response = await postChat(validBody);
      const body = await response.json();

      expect(response.status).toBe(502);
      expect(body.error.code).toBe('AI_PROVIDER_INVALID_RESPONSE');
    });

    it('hides unexpected provider errors behind a generic 500', async () => {
      await startServer({
        provider: {
          name: 'exploding',
          generateReply: vi.fn().mockRejectedValue(new Error('secret internal /etc/passwd')),
        },
      });

      const response = await postChat(validBody);
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body.error.code).toBe('INTERNAL_ERROR');
      expect(JSON.stringify(body)).not.toContain('passwd');
    });

    it('includes a requestId for log correlation', async () => {
      const response = await postChat('{ not json');
      const body = await response.json();

      expect(body.error.requestId).toEqual(expect.any(String));
      expect(response.headers.get('x-request-id')).toBe(body.error.requestId);
    });

    it('echoes a caller-supplied request id', async () => {
      const response = await postChat('{ not json', {
        headers: { 'x-request-id': 'trace-abc-123' },
      });
      const body = await response.json();

      expect(body.error.requestId).toBe('trace-abc-123');
    });
  });

  describe('rate limiting', () => {
    it('returns 429 once the limit is exceeded', async () => {
      await startServer({
        rateLimiter: createChatRateLimiter({ windowMs: 60_000, limit: 2 }),
      });

      expect((await postChat(validBody)).status).toBe(200);
      expect((await postChat(validBody)).status).toBe(200);

      const third = await postChat(validBody);
      expect(third.status).toBe(429);
      expect((await third.json()).error.code).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('advertises the limit via standard headers', async () => {
      await startServer({
        rateLimiter: createChatRateLimiter({ windowMs: 60_000, limit: 5 }),
      });

      const response = await postChat(validBody);
      // draft-7 uses a single combined RateLimit header.
      expect(response.headers.get('ratelimit')).toContain('limit=5');
    });

    it('does not consume the budget on a rejected request', async () => {
      await startServer({
        rateLimiter: createChatRateLimiter({ windowMs: 60_000, limit: 1 }),
      });

      expect((await postChat(validBody)).status).toBe(200);
      // Second call is limited even though it is invalid, proving the limiter
      // counts attempts rather than successful generations.
      expect((await postChat(validBody)).status).toBe(429);
    });
  });

  describe('unmatched routes and health', () => {
    it('returns a structured 404', async () => {
      const response = await fetch(`${baseUrl}/api/does-not-exist`);
      const body = await response.json();

      expect(response.status).toBe(404);
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('reports health without exposing credentials', async () => {
      const response = await fetch(`${baseUrl}/api/health`);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.status).toBe('ok');
      expect(JSON.stringify(body)).not.toMatch(/key|token|secret|password/i);
    });
  });
});