// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createOpenAICompatibleProvider } from '../src/services/ai/providers/openaiCompatible.provider.js';

/**
 * Tests for the OpenAI-compatible adapter.
 *
 * `fetchImpl` is injected, so these cover the adapter's own contract — request
 * shape, status mapping, timeout handling — with no network and no credentials.
 * This is the layer that touches the API key, so it is also the right place to
 * prove the key is never echoed back to the caller.
 */

const TEST_KEY = 'sk-test-do-not-log-me';

function createProvider(overrides = {}) {
  return createOpenAICompatibleProvider({
    baseUrl: 'https://api.example.test/v1',
    model: 'test-model',
    apiKey: TEST_KEY,
    timeoutMs: 50,
    maxTokens: 100,
    ...overrides,
  });
}

function stubFetch({ ok = true, status = 200, json = {}, text = '' } = {}) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => {
      if (json instanceof Error) throw json;
      return json;
    },
    text: async () => text,
  });
  return fetchMock;
}

const messages = [{ role: 'user', content: 'Hello' }];

describe('openai-compatible provider', () => {
  describe('request shape', () => {
    it('posts to /chat/completions with the model and messages', async () => {
      const fetchImpl = stubFetch({
        json: { choices: [{ message: { role: 'assistant', content: 'Hi!' } }] },
      });

      await createProvider({ fetchImpl }).generateReply(messages);

      const [url, options] = fetchImpl.mock.calls[0];
      expect(url).toBe('https://api.example.test/v1/chat/completions');
      expect(options.method).toBe('POST');
      expect(JSON.parse(options.body)).toEqual({
        model: 'test-model',
        messages,
        max_tokens: 100,
      });
    });

    it('sends the key as a bearer token', async () => {
      const fetchImpl = stubFetch({
        json: { choices: [{ message: { role: 'assistant', content: 'Hi!' } }] },
      });

      await createProvider({ fetchImpl }).generateReply(messages);

      expect(fetchImpl.mock.calls[0][1].headers.authorization).toBe(`Bearer ${TEST_KEY}`);
    });

    it('strips a trailing slash from the base URL', async () => {
      const fetchImpl = stubFetch({
        json: { choices: [{ message: { role: 'assistant', content: 'Hi!' } }] },
      });

      await createProvider({
        baseUrl: 'https://api.example.test/v1/',
        fetchImpl,
      }).generateReply(messages);

      expect(fetchImpl.mock.calls[0][0]).toBe('https://api.example.test/v1/chat/completions');
    });
  });

  describe('response handling', () => {
    it('returns the assistant content', async () => {
      const fetchImpl = stubFetch({
        json: { choices: [{ message: { role: 'assistant', content: 'Hello! How can I help?' } }] },
      });

      await expect(createProvider({ fetchImpl }).generateReply(messages)).resolves.toEqual({
        role: 'assistant',
        content: 'Hello! How can I help?',
      });
    });

    it('rejects when there are no choices', async () => {
      const fetchImpl = stubFetch({ json: { choices: [] } });

      await expect(createProvider({ fetchImpl }).generateReply(messages)).rejects.toMatchObject({
        code: 'AI_PROVIDER_EMPTY_RESPONSE',
        statusCode: 502,
      });
    });

    it('rejects a malformed JSON body', async () => {
      const fetchImpl = stubFetch({ json: new SyntaxError('bad json') });

      await expect(createProvider({ fetchImpl }).generateReply(messages)).rejects.toMatchObject({
        code: 'AI_PROVIDER_INVALID_RESPONSE',
      });
    });
  });

  describe('failure mapping', () => {
    it.each([
      [401, 'AI_PROVIDER_UNAUTHORIZED', 502],
      [403, 'AI_PROVIDER_UNAUTHORIZED', 502],
      [400, 'AI_PROVIDER_REJECTED_REQUEST', 502],
      [429, 'AI_PROVIDER_RATE_LIMITED', 503],
      [500, 'AI_PROVIDER_UNAVAILABLE', 503],
      [503, 'AI_PROVIDER_UNAVAILABLE', 503],
    ])('maps HTTP %i to %s', async (status, code, expectedStatus) => {
      const fetchImpl = stubFetch({ ok: false, status, text: '{"error":"upstream"}' });

      await expect(createProvider({ fetchImpl }).generateReply(messages)).rejects.toMatchObject({
        code,
        statusCode: expectedStatus,
      });
    });

    it('never includes the API key in an error', async () => {
      const fetchImpl = stubFetch({ ok: false, status: 401, text: '{"error":"bad key"}' });

      const error = await createProvider({ fetchImpl })
        .generateReply(messages)
        .catch((caught) => caught);

      expect(JSON.stringify({ message: error.message, code: error.code })).not.toContain(TEST_KEY);
    });

    it('maps a connection failure to a bad gateway', async () => {
      const fetchImpl = vi.fn().mockRejectedValue(new TypeError('fetch failed'));

      await expect(createProvider({ fetchImpl }).generateReply(messages)).rejects.toMatchObject({
        code: 'AI_PROVIDER_UNREACHABLE',
        statusCode: 502,
      });
    });

    it('maps a timeout to a gateway timeout', async () => {
      const fetchImpl = vi.fn().mockImplementation(
        (_url, { signal }) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => {
              reject(signal.reason ?? new DOMException('Aborted', 'TimeoutError'));
            });
          }),
      );

      await expect(
        createProvider({ fetchImpl, timeoutMs: 20 }).generateReply(messages),
      ).rejects.toMatchObject({
        code: 'AI_PROVIDER_TIMEOUT',
        statusCode: 504,
      });
    });

    it('aborts the upstream call once the timeout elapses', async () => {
      let capturedSignal;
      // Model real fetch: it rejects with the abort reason when the signal
      // fires. A fake that simply never settles would hang the test instead of
      // exercising the abort path.
      const fetchImpl = vi.fn().mockImplementation((_url, { signal }) => {
        capturedSignal = signal;
        return new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'TimeoutError'));
          });
        });
      });

      await expect(
        createProvider({ fetchImpl, timeoutMs: 20 }).generateReply(messages),
      ).rejects.toMatchObject({ code: 'AI_PROVIDER_TIMEOUT' });

      expect(capturedSignal.aborted).toBe(true);
    });
  });

  describe('configuration guard', () => {
    it('refuses to construct without an API key', () => {
      expect(() => createOpenAICompatibleProvider({ apiKey: undefined, fetchImpl: stubFetch() }))
        .toThrowError(/not configured/i);
    });
  });
});