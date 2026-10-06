import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  requestAssistantReply,
  streamAssistantReply,
  toApiMessages,
  toChatMessage,
} from './chatService.js';

/**
 * Covers the UI <-> API contract translation, which is the part most likely to
 * drift: `sender: 'robot'` in the UI must become `role: 'assistant'` on the
 * wire and come back the same way.
 */
describe('chatService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubFetch(response, { ok = true, status = 200 } = {}) {
    const fetchMock = vi.fn().mockResolvedValue({
      ok,
      status,
      headers: new Headers({
        'content-type': 'text/event-stream; charset=utf-8',
      }),
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(response));
          controller.close();
        },
      }),
      json: async () => response,
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  describe('toApiMessages', () => {
    it('maps sender to role and message to content', () => {
      expect(
        toApiMessages([
          { id: '1', sender: 'user', message: 'Hello' },
          { id: '2', sender: 'robot', message: 'Hi!' },
        ]),
      ).toEqual([
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi!' },
      ]);
    });
  });

  describe('toChatMessage', () => {
    it('maps assistant role back to the robot sender', () => {
      expect(toChatMessage({ role: 'assistant', content: 'Hello!' }, 'abc')).toEqual({
        id: 'abc',
        sender: 'robot',
        message: 'Hello!',
        createdAt: expect.any(Number),
      });
    });

    it('maps the user role back to the user sender', () => {
      expect(toChatMessage({ role: 'user', content: 'Hello' }, 'abc').sender).toBe('user');
    });
  });

  describe('requestAssistantReply', () => {
    it('posts the conversation and returns a UI message', async () => {
      const fetchMock = stubFetch({
        message: { role: 'assistant', content: 'Hello! How can I help?' },
      });

      const reply = await requestAssistantReply({
        messages: [{ id: '1', sender: 'user', message: 'Hello' }],
      });

      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe('/api/chat');
      expect(options.method).toBe('POST');
      expect(options.headers['content-type']).toBe('application/json');
      expect(JSON.parse(options.body)).toEqual({
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(reply.sender).toBe('robot');
      expect(reply.message).toBe('Hello! How can I help?');
    });

    it('raises the server error message on a 4xx', async () => {
      stubFetch(
        { error: { code: 'VALIDATION_ERROR', message: 'The request body is invalid.' } },
        { ok: false, status: 400 },
      );

      await expect(
        requestAssistantReply({ messages: [{ id: '1', sender: 'user', message: 'x' }] }),
      ).rejects.toMatchObject({
        message: 'The request body is invalid.',
        status: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    it('reports an unreachable server as a network error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

      await expect(
        requestAssistantReply({ messages: [{ id: '1', sender: 'user', message: 'x' }] }),
      ).rejects.toMatchObject({ isNetworkError: true });
    });

    it('rejects a malformed successful payload', async () => {
      stubFetch({ message: null });

      await expect(
        requestAssistantReply({ messages: [{ id: '1', sender: 'user', message: 'x' }] }),
      ).rejects.toThrow(/malformed/i);
    });
  });

  describe('streamAssistantReply', () => {
    function sse(...events) {
      return events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('');
    }

    it('sends the stream flag, reports deltas, and returns one finalized message', async () => {
      const fetchMock = stubFetch(
        sse(
          { type: 'delta', content: 'Hello ' },
          { type: 'delta', content: 'there' },
          { type: 'done', message: { role: 'assistant', content: 'Hello there' } },
        ),
      );
      const onDelta = vi.fn();

      const reply = await streamAssistantReply({
        messages: [{ id: '1', sender: 'user', message: 'Hello' }],
        onDelta,
      });

      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
        messages: [{ role: 'user', content: 'Hello' }],
        stream: true,
      });
      expect(onDelta).toHaveBeenNthCalledWith(
        1,
        'Hello ',
        expect.objectContaining({ message: 'Hello ', status: 'streaming' }),
      );
      expect(onDelta).toHaveBeenNthCalledWith(
        2,
        'there',
        expect.objectContaining({ message: 'Hello there', status: 'streaming' }),
      );
      expect(reply).toMatchObject({
        sender: 'robot',
        message: 'Hello there',
        status: 'complete',
      });
      expect(reply.id).toBe(onDelta.mock.calls[0][1].id);
    });

    it('surfaces streamed provider errors', async () => {
      stubFetch(
        sse({
          type: 'error',
          error: {
            code: 'AI_PROVIDER_UNAVAILABLE',
            message: 'The provider is unavailable.',
          },
        }),
      );

      await expect(
        streamAssistantReply({ messages: [{ sender: 'user', message: 'Hello' }] }),
      ).rejects.toMatchObject({
        code: 'AI_PROVIDER_UNAVAILABLE',
        message: 'The provider is unavailable.',
      });
    });

    it('treats an ended stream without a final event as interrupted', async () => {
      stubFetch(sse({ type: 'delta', content: 'partial' }));

      await expect(
        streamAssistantReply({ messages: [{ sender: 'user', message: 'Hello' }] }),
      ).rejects.toMatchObject({ code: 'STREAM_INTERRUPTED' });
    });
  });
});