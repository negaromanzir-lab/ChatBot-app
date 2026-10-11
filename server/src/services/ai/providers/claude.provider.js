import config from '../../../config/env.js';
import ApiError from '../../../utils/ApiError.js';
import {
  createRequestSignal,
  mapProviderRequestError,
  mapProviderStatus,
  normalizeUsage,
  parseSseJson,
  readSseData,
} from './providerUtils.js';

const DEFAULT_SYSTEM_INSTRUCTION =
  'You are a helpful, concise, and safe assistant. Answer directly and clearly.';
const API_URL = 'https://api.anthropic.com/v1/messages';

export function createClaudeProvider(overrides = {}) {
  const settings = {
    apiKey: overrides.apiKey ?? config.ai.providers.claude.apiKey,
    model: overrides.model ?? config.ai.providers.claude.model,
    timeoutMs: overrides.timeoutMs ?? config.ai.timeoutMs,
    maxTokens: overrides.maxTokens ?? config.ai.maxTokens,
    fetchImpl: overrides.fetchImpl ?? globalThis.fetch,
    systemInstruction: overrides.systemInstruction ?? DEFAULT_SYSTEM_INSTRUCTION,
  };
  if (!settings.apiKey) {
    throw ApiError.serviceUnavailable(
      'AI_PROVIDER_NOT_CONFIGURED',
      'The AI provider is not configured on the server.',
    );
  }

  function createPayload(messages, stream, systemInstruction = settings.systemInstruction) {
    if (!messages.length) {
      throw ApiError.badRequest(
        'AI_PROVIDER_INVALID_MESSAGES',
        'At least one valid conversation message is required.',
      );
    }
    return {
      model: settings.model,
      max_tokens: settings.maxTokens,
      system: systemInstruction,
      messages: messages.map((message) => ({
        ...message,
        content: typeof message.content === 'string'
          ? message.content
          : message.content.flatMap((part) => {
            if (part?.type === 'text' && typeof part.text === 'string') {
              return [{ type: 'text', text: part.text }];
            }
            if (
              part?.type === 'image'
              && typeof part.mediaType === 'string'
              && typeof part.data === 'string'
            ) {
              return [{
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: part.mediaType,
                  data: part.data,
                },
              }];
            }
            return [];
          }),
      })),
      ...(stream ? { stream: true } : {}),
    };
  }

  async function request(messages, { signal, stream = false, systemInstruction } = {}) {
    try {
      return await settings.fetchImpl(API_URL, {
        method: 'POST',
        signal: createRequestSignal(settings.timeoutMs, signal),
        headers: {
          'content-type': 'application/json',
          'anthropic-version': '2023-06-01',
          'x-api-key': settings.apiKey,
        },
        body: JSON.stringify(createPayload(messages, stream, systemInstruction)),
      });
    } catch (error) {
      throw mapProviderRequestError(error, settings.timeoutMs, signal, 'claude');
    }
  }

  async function checkResponse(response) {
    if (!response.ok) throw mapProviderStatus(response.status);
  }

  async function generateResponse(messages, options = {}) {
    const response = await request(messages, options);
    await checkResponse(response);
    let result;
    try {
      result = await response.json();
    } catch (error) {
      throw ApiError.badGateway(
        'AI_PROVIDER_INVALID_RESPONSE',
        'The AI provider returned an unreadable response.',
        { cause: error },
      );
    }
    const content = result?.content
      ?.filter((part) => part.type === 'text' && typeof part.text === 'string')
      .map((part) => part.text)
      .join('');
    if (!content) {
      throw ApiError.badGateway(
        'AI_PROVIDER_EMPTY_RESPONSE',
        'The AI provider returned an empty response.',
      );
    }
    const usage = normalizeUsage(result?.usage);
    return { role: 'assistant', content, ...(usage ? { usage } : {}) };
  }

  async function* streamResponse(messages, options = {}) {
    const response = await request(messages, { ...options, stream: true });
    await checkResponse(response);
    let streamedUsage = null;
    for await (const data of readSseData(response, 'claude', {
      signal: options.signal,
      timeoutMs: settings.timeoutMs,
    })) {
      const event = parseSseJson(data, 'claude');
      // input_tokens arrives on message_start, output_tokens on message_delta.
      if (event?.type === 'message_start' && event.message?.usage) {
        streamedUsage = { ...event.message.usage };
      } else if (event?.type === 'message_delta' && event.usage) {
        streamedUsage = { ...(streamedUsage ?? {}), ...event.usage };
      }
      if (event?.type === 'content_block_delta' && typeof event.delta?.text === 'string') {
        yield event.delta.text;
      }
    }
    const normalizedUsage = normalizeUsage(streamedUsage);
    if (normalizedUsage) options.onUsage?.(normalizedUsage);
  }

  return { name: 'claude', generateResponse, streamResponse };
}

export default createClaudeProvider;
