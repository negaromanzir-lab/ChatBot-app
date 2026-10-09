// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createOpenAIEmbeddingProvider } from '../src/modules/rag/openaiEmbeddingProvider.js';

describe('OpenAI embedding provider', () => {
  it('uses only server credentials and returns vectors in input order', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [
        { index: 1, embedding: [0.2, 0.3] },
        { index: 0, embedding: [0.1, 0.2] },
      ],
    }), { status: 200 }));
    const provider = createOpenAIEmbeddingProvider({
      apiKey: 'server-only-key',
      model: 'test-embedding-model',
      dimensions: 2,
      baseUrl: 'https://embeddings.example/v1/',
      timeoutMs: 1000,
      fetchImpl,
    });

    await expect(provider.embedTexts(['first text', 'second text'])).resolves.toEqual([
      [0.1, 0.2],
      [0.2, 0.3],
    ]);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://embeddings.example/v1/embeddings',
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: 'Bearer server-only-key' }),
      }),
    );
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toMatchObject({
      model: 'test-embedding-model',
      input: ['first text', 'second text'],
      dimensions: 2,
    });
  });

  it('batches inputs larger than the provider batch size', async () => {
    const fetchImpl = vi.fn(async (_url, request) => {
      const { input } = JSON.parse(request.body);
      return new Response(JSON.stringify({
        data: input.map((_text, index) => ({ index, embedding: [index] })),
      }), { status: 200 });
    });
    const provider = createOpenAIEmbeddingProvider({
      apiKey: 'key',
      dimensions: 1,
      fetchImpl,
    });

    await expect(provider.embedTexts(Array.from({ length: 65 }, (_, i) => `text ${i}`)))
      .resolves.toHaveLength(65);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('maps provider rate limits to a safe common error', async () => {
    const provider = createOpenAIEmbeddingProvider({
      apiKey: 'server-only-key',
      fetchImpl: vi.fn().mockResolvedValue(new Response('secret provider message', { status: 429 })),
    });

    await expect(provider.embedQuery('question')).rejects.toMatchObject({
      code: 'AI_EMBEDDINGS_RATE_LIMITED',
      statusCode: 503,
    });
  });

  it('rejects missing credentials and malformed vector dimensions', async () => {
    const unconfigured = createOpenAIEmbeddingProvider({ apiKey: '' });
    await expect(unconfigured.embedQuery('question')).rejects.toMatchObject({
      code: 'AI_EMBEDDINGS_NOT_CONFIGURED',
    });

    const provider = createOpenAIEmbeddingProvider({
      apiKey: 'key',
      dimensions: 2,
      fetchImpl: vi.fn().mockResolvedValue(new Response(JSON.stringify({
        data: [{ index: 0, embedding: [0.1] }],
      }), { status: 200 })),
    });
    await expect(provider.embedQuery('question')).rejects.toMatchObject({
      code: 'AI_EMBEDDINGS_INVALID_RESPONSE',
      statusCode: 502,
    });
  });
});
