// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { normalizeUsage } from '../src/services/ai/providers/providerUtils.js';
import { createOpenAIProvider } from '../src/services/ai/providers/openai.provider.js';
import { createChatService } from '../src/services/ai/chat.service.js';

const API_KEY = 'sk-test-usage-tracking';
const messages = [{ role: 'user', content: 'Hi' }];

function createProvider(fetchImpl) {
  return createOpenAIProvider({
    apiKey: API_KEY,
    baseUrl: 'https://api.openai.test/v1',
    model: 'test-model',
    timeoutMs: 1000,
    maxTokens: 20,
    fetchImpl,
  });
}

describe('normalizeUsage', () => {
  it('normalizes the OpenAI token field names', () => {
    expect(normalizeUsage({ prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }))
      .toEqual({ inputTokens: 10, outputTokens: 5, totalTokens: 15 });
  });

  it('normalizes Gemini usage metadata', () => {
    expect(normalizeUsage({ promptTokenCount: 3, candidatesTokenCount: 4, totalTokenCount: 7 }))
      .toEqual({ inputTokens: 3, outputTokens: 4, totalTokens: 7 });
  });

  it('normalizes Claude usage and derives the total when absent', () => {
    expect(normalizeUsage({ input_tokens: 2, output_tokens: 8 }))
      .toEqual({ inputTokens: 2, outputTokens: 8, totalTokens: 10 });
  });

  it('returns null rather than fabricating counts', () => {
    expect(normalizeUsage(undefined)).toBeNull();
    expect(normalizeUsage({})).toBeNull();
  });
});

describe('OpenAI provider token usage', () => {
  it('returns normalized usage from the completion payload', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: 'hi' } }],
          usage: { prompt_tokens: 12, completion_tokens: 6, total_tokens: 18 },
        }),
        { status: 200 },
      ),
    );

    await expect(createProvider(fetchImpl).generateResponse(messages)).resolves.toEqual({
      role: 'assistant',
      content: 'hi',
      usage: { inputTokens: 12, outputTokens: 6, totalTokens: 18 },
    });
  });

  it('reports streamed usage through the onUsage callback and requests it', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n'));
        controller.enqueue(
          encoder.encode('data: {"choices":[],"usage":{"prompt_tokens":4,"completion_tokens":2,"total_tokens":6}}\n\n'),
        );
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    });
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
    );
    const onUsage = vi.fn();

    const chunks = [];
    for await (const chunk of createProvider(fetchImpl).streamResponse(messages, { onUsage })) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(['Hi']);
    expect(onUsage).toHaveBeenCalledWith({ inputTokens: 4, outputTokens: 2, totalTokens: 6 });
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).stream_options)
      .toEqual({ include_usage: true });
  });
});

describe('chat service usage propagation', () => {
  it('attaches provider usage to the assistant reply', async () => {
    const provider = {
      name: 'openai',
      async generateResponse() {
        return {
          role: 'assistant',
          content: 'ok',
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        };
      },
      async *streamResponse() { yield 'ok'; },
    };
    const service = createChatService({ provider });

    await expect(service.generateAssistantReply(messages)).resolves.toEqual({
      role: 'assistant',
      content: 'ok',
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    });
  });

  it('forwards streamed usage to the caller callback', async () => {
    const onUsage = vi.fn();
    const provider = {
      name: 'openai',
      async generateResponse() { return { role: 'assistant', content: 'x' }; },
      async *streamResponse(_messages, options) {
        yield 'x';
        options.onUsage?.({ inputTokens: 2, outputTokens: 3, totalTokens: 5 });
      },
    };
    const service = createChatService({ provider });

    const chunks = [];
    for await (const chunk of service.streamAssistantReply(messages, { onUsage })) {
      chunks.push(chunk);
    }
    expect(chunks).toEqual(['x']);

    expect(onUsage).toHaveBeenCalledWith({ inputTokens: 2, outputTokens: 3, totalTokens: 5 });
  });
});
