import config from '../../../config/env.js';
import ApiError from '../../../utils/ApiError.js';
import {
  createRequestSignal,
  mapProviderRequestError,
  mapProviderStatus,
  parseSseJson,
  readSseData,
} from './providerUtils.js';

const DEFAULT_SYSTEM_INSTRUCTION =
  'You are a helpful, concise, and safe assistant. Answer directly and clearly.';
const API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

export function createGeminiProvider(overrides = {}) {
  const settings = {
    apiKey: overrides.apiKey ?? config.ai.providers.gemini.apiKey,
    model: overrides.model ?? config.ai.providers.gemini.model,
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

  function payload(messages, systemInstruction = settings.systemInstruction) {
    const contents = messages.map(({ role, content }) => ({
      role: role === 'assistant' ? 'model' : 'user',
      parts: typeof content === 'string'
        ? [{ text: content }]
        : content.flatMap((part) => {
          if (part?.type === 'text' && typeof part.text === 'string') {
            return [{ text: part.text }];
          }
          if (
            part?.type === 'image'
            && typeof part.mediaType === 'string'
            && typeof part.data === 'string'
          ) {
            return [{
              inlineData: {
                mimeType: part.mediaType,
                data: part.data,
              },
            }];
          }
          return [];
        }),
    }));
    if (!contents.length) {
      throw ApiError.badRequest(
        'AI_PROVIDER_INVALID_MESSAGES',
        'At least one valid conversation message is required.',
      );
    }
    return {
      systemInstruction: {
        parts: [{ text: systemInstruction }],
      },
      contents,
      generationConfig: { maxOutputTokens: settings.maxTokens },
    };
  }

  function endpoint(stream) {
    const method = stream ? 'streamGenerateContent?alt=sse' : 'generateContent';
    return `${API_BASE_URL}/${encodeURIComponent(settings.model)}:${method}`;
  }

  async function request(messages, { signal, stream = false, systemInstruction } = {}) {
    try {
      return await settings.fetchImpl(endpoint(stream), {
        method: 'POST',
        signal: createRequestSignal(settings.timeoutMs, signal),
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': settings.apiKey,
        },
        body: JSON.stringify(payload(messages, systemInstruction)),
      });
    } catch (error) {
      throw mapProviderRequestError(error, settings.timeoutMs, signal, 'gemini');
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
    const content = result?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text)
      .filter((text) => typeof text === 'string')
      .join('');
    if (!content) {
      throw ApiError.badGateway(
        'AI_PROVIDER_EMPTY_RESPONSE',
        'The AI provider returned an empty response.',
      );
    }
    return { role: 'assistant', content };
  }

  async function* streamResponse(messages, options = {}) {
    const response = await request(messages, { ...options, stream: true });
    await checkResponse(response);
    for await (const data of readSseData(response, 'gemini', {
      signal: options.signal,
      timeoutMs: settings.timeoutMs,
    })) {
      const event = parseSseJson(data, 'gemini');
      const content = event?.candidates?.[0]?.content?.parts
        ?.map((part) => part.text)
        .filter((text) => typeof text === 'string')
        .join('');
      if (content) yield content;
    }
  }

  return { name: 'gemini', generateResponse, streamResponse };
}

export default createGeminiProvider;
