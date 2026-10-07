import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiRequest, apiStream, setAuthTokenProvider } from './apiClient.js';

describe('authenticated API client', () => {
  afterEach(() => {
    setAuthTokenProvider(null);
    vi.unstubAllGlobals();
  });

  it('adds the Clerk session token as a bearer credential', async () => {
    const token = 'mock-clerk-token';
    setAuthTokenProvider(async () => token);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ conversations: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await apiRequest('/conversations');

    expect(fetchMock.mock.calls[0][1].headers.authorization).toBe(`Bearer ${token}`);
  });

  it('surfaces a Clerk token retrieval failure instead of misreporting a network error', async () => {
    setAuthTokenProvider(async () => {
      throw new Error('Clerk unavailable');
    });

    await expect(apiRequest('/conversations')).rejects.toMatchObject({
      code: 'AUTH_TOKEN_ERROR',
      message: 'Could not retrieve your sign-in token. Please sign in again.',
    });
  });

  it('uses the same authenticated token for streamed chat requests', async () => {
    setAuthTokenProvider(async () => 'mock-clerk-token');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/event-stream' }),
      body: new ReadableStream(),
    });
    vi.stubGlobal('fetch', fetchMock);

    await apiStream('/chat', { body: { messages: [] } });

    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers.accept).toBe('text/event-stream');
    expect(headers['content-type']).toBe('application/json');
    expect(headers.authorization).toBe('Bearer mock-clerk-token');
  });
});
