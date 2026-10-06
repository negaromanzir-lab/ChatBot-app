// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createChatService } from '../src/services/ai/chat.service.js';
import { createProvider as createProviderFactory } from '../src/services/ai/providers/index.js';
import { createOpenAIProvider } from '../src/services/ai/providers/openai.provider.js';

const API_KEY = 'sk-test-server-only';
const messages = [{ role: 'user', content: 'Hello' }];

function createProvider(fetchImpl, overrides = {}) {
  return createOpenAIProvider({
    apiKey: API_KEY,
    baseUrl: 'https://api.openai.test/v1/',
    model: 'test-model',
    timeoutMs: 1000,
    maxTokens: 120,
    fetchImpl,
    ...overrides,
  });
}

describe('OpenAI provider', () => {
  it('sends server instructions and conversation to OpenAI', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ choices: [{ message: { content: 'Hello from OpenAI' } }] }),
        { status: 200 },
      ),
    );

    const response = await createProvider(fetchImpl).generateResponse(messages);

    expect(response).toEqual({ role: 'assistant', content: 'Hello from OpenAI' });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.openai.test/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ authorization: `Bearer ${API_KEY}` }),
      }),
    );
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({
      model: 'test-model',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful, concise, and safe assistant. Answer directly and clearly.',
        },
        ...messages,
      ],
      max_tokens: 120,
    });
  });

  it('is selected by the provider registry and used by chat orchestration', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ choices: [{ message: { content: 'Provider reply' } }] }),
        { status: 200 },
      ),
    );
    const provider = createProviderFactory({
      provider: 'openai',
      apiKey: API_KEY,
      baseUrl: 'https://api.openai.test/v1',
      model: 'test-model',
      fetchImpl,
    });
    const service = createChatService({ provider });

    await expect(service.generateAssistantReply(messages)).resolves.toEqual({
      role: 'assistant',
      content: 'Provider reply',
    });
  });

  it('streams content deltas from the OpenAI event stream', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n'),
        );
        controller.enqueue(
          encoder.encode('data: {"choices":[{"delta":{"content":" there"}}]}\n\n'),
        );
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    });
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
    );

    const chunks = [];
    for await (const chunk of createProvider(fetchImpl).streamResponse(messages)) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(['Hello', ' there']);
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).stream).toBe(true);
  });

  it('does not expose credentials in provider failures', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: API_KEY }), { status: 401 }),
    );

    await expect(createProvider(fetchImpl).generateResponse(messages)).rejects.toMatchObject({
      code: 'AI_PROVIDER_UNAUTHORIZED',
      message: 'The AI provider rejected the server credentials.',
    });
  });

  it('rejects construction without a server-side API key', () => {
    expect(() => createProvider(vi.fn(), { apiKey: '' })).toThrow(/not configured/i);
  });
});
