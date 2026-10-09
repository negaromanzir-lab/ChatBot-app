import ApiError from '../../../utils/ApiError.js';
import config from '../../../config/env.js';
import logger from '../../../config/logger.js';

const DEFAULT_SYSTEM_INSTRUCTION =
  'You are a helpful, concise, and safe assistant. Answer directly and clearly.';

function createRequestSignal(timeoutMs, callerSignal) {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  return callerSignal ? AbortSignal.any([callerSignal, timeoutSignal]) : timeoutSignal;
}

function providerError(status) {
  if (status === 401 || status === 403) {
    return ApiError.badGateway(
      'AI_PROVIDER_UNAUTHORIZED',
      'The AI provider rejected the server credentials.',
    );
  }
  if (status === 429) {
    return ApiError.serviceUnavailable(
      'AI_PROVIDER_RATE_LIMITED',
      'The AI provider is rate limiting requests. Please try again shortly.',
    );
  }
  if (status >= 500) {
    return ApiError.serviceUnavailable(
      'AI_PROVIDER_UNAVAILABLE',
      'The AI provider is currently unavailable.',
    );
  }
  return ApiError.badGateway(
    'AI_PROVIDER_REJECTED_REQUEST',
    'The AI provider rejected the request.',
  );
}

function mapRequestError(error, timeoutMs, callerSignal) {
  if (error instanceof ApiError) return error;
  if (callerSignal?.aborted) return error;

  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
    logger.warn({ timeoutMs }, 'AI provider request timed out');
    return ApiError.gatewayTimeout(
      'AI_PROVIDER_TIMEOUT',
      'The AI provider did not respond in time. Please try again.',
      { cause: error },
    );
  }

  logger.error({ err: error }, 'AI provider request failed');
  return ApiError.badGateway(
    'AI_PROVIDER_UNREACHABLE',
    'Could not reach the AI provider.',
    { cause: error },
  );
}

/**
 * Creates the OpenAI adapter. Credentials are resolved from server config only
 * and are never included in logs or returned values.
 */
export function createOpenAIProvider(overrides = {}) {
  const settings = {
    apiKey: overrides.apiKey ?? config.ai.apiKey,
    model: overrides.model ?? config.ai.model,
    baseUrl: (overrides.baseUrl ?? config.ai.baseUrl).replace(/\/+$/, ''),
    timeoutMs: overrides.timeoutMs ?? config.ai.timeoutMs,
    maxTokens: overrides.maxTokens ?? config.ai.maxTokens,
    fetchImpl: overrides.fetchImpl ?? globalThis.fetch,
    systemInstruction:
      overrides.systemInstruction === undefined
        ? DEFAULT_SYSTEM_INSTRUCTION
        : overrides.systemInstruction,
    includeSystemInstruction: overrides.includeSystemInstruction ?? true,
  };

  if (!settings.apiKey) {
    throw ApiError.serviceUnavailable(
      'AI_PROVIDER_NOT_CONFIGURED',
      'The AI provider is not configured on the server.',
    );
  }

  function createPayloadMessages(messages, systemInstruction) {
    const validMessages = Array.isArray(messages)
      ? messages.filter(
          (message) =>
            message &&
            (message.role === 'user' || message.role === 'assistant') &&
            (typeof message.content === 'string' || Array.isArray(message.content)),
        )
      : [];

    if (validMessages.length === 0) {
      throw ApiError.badRequest(
        'AI_PROVIDER_INVALID_MESSAGES',
        'At least one valid conversation message is required.',
      );
    }

    const instruction = systemInstruction ?? settings.systemInstruction;
    const normalizedMessages = validMessages.map((message) => ({
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
              type: 'image_url',
              image_url: {
                url: `data:${part.mediaType};base64,${part.data}`,
              },
            }];
          }
          return [];
        }),
    }));

    return (settings.includeSystemInstruction || systemInstruction) && instruction
      ? [{ role: 'system', content: instruction }, ...normalizedMessages]
      : normalizedMessages;
  }

  function createRequest(messages, { systemInstruction, signal, stream = false } = {}) {
    return settings.fetchImpl(`${settings.baseUrl}/chat/completions`, {
      method: 'POST',
      signal: createRequestSignal(settings.timeoutMs, signal),
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify({
        model: settings.model,
        messages: createPayloadMessages(messages, systemInstruction),
        max_tokens: settings.maxTokens,
        ...(stream ? { stream: true } : {}),
      }),
    });
  }

  async function checkResponse(response) {
    if (response.ok) return;

    // Do not log the upstream body: error payloads are outside our control and
    // may contain sensitive request or account details.
    logger.error(
      { status: response.status, model: settings.model },
      'AI provider returned an error status',
    );
    throw providerError(response.status);
  }

  async function generateResponse(messages, options = {}) {
    let response;
    try {
      response = await createRequest(messages, options);
    } catch (error) {
      throw mapRequestError(error, settings.timeoutMs, options.signal);
    }

    await checkResponse(response);

    let payload;
    try {
      payload = await response.json();
    } catch (error) {
      logger.error({ err: error }, 'AI provider returned malformed JSON');
      throw ApiError.badGateway(
        'AI_PROVIDER_INVALID_RESPONSE',
        'The AI provider returned an unreadable response.',
        { cause: error },
      );
    }

    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content.length === 0) {
      logger.error({ model: settings.model }, 'AI provider response contained no message content');
      throw ApiError.badGateway(
        'AI_PROVIDER_EMPTY_RESPONSE',
        'The AI provider returned an empty response.',
      );
    }

    return { role: 'assistant', content };
  }

  async function* streamResponse(messages, options = {}) {
    let response;
    try {
      response = await createRequest(messages, { ...options, stream: true });
    } catch (error) {
      throw mapRequestError(error, settings.timeoutMs, options.signal);
    }

    await checkResponse(response);

    if (!response.body) {
      logger.error({ model: settings.model }, 'AI provider response had no stream body');
      throw ApiError.badGateway(
        'AI_PROVIDER_INVALID_RESPONSE',
        'The AI provider returned an unreadable response.',
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let completed = false;

    try {
      while (true) {
        let result;
        try {
          result = await reader.read();
        } catch (error) {
          throw mapRequestError(error, settings.timeoutMs, options.signal);
        }

        buffer += decoder.decode(result.value ?? new Uint8Array(), {
          stream: !result.done,
        });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (data === '[DONE]') {
            completed = true;
            return;
          }
          if (!data) continue;

          let event;
          try {
            event = JSON.parse(data);
          } catch (error) {
            logger.error({ err: error }, 'AI provider returned malformed stream data');
            throw ApiError.badGateway(
              'AI_PROVIDER_INVALID_RESPONSE',
              'The AI provider returned an unreadable response.',
              { cause: error },
            );
          }

          const content = event?.choices?.[0]?.delta?.content;
          if (typeof content === 'string' && content.length > 0) yield content;
        }

        if (result.done) {
          completed = true;
          break;
        }
      }

      if (buffer.startsWith('data:')) {
        const data = buffer.slice(5).trim();
        if (data && data !== '[DONE]') {
          let event;
          try {
            event = JSON.parse(data);
          } catch (error) {
            logger.error({ err: error }, 'AI provider returned malformed stream data');
            throw ApiError.badGateway(
              'AI_PROVIDER_INVALID_RESPONSE',
              'The AI provider returned an unreadable response.',
              { cause: error },
            );
          }
          const content = event?.choices?.[0]?.delta?.content;
          if (typeof content === 'string' && content.length > 0) yield content;
        }
      }
    } finally {
      if (!completed) {
        try {
          await reader.cancel();
        } catch (error) {
          logger.warn({ err: error }, 'Could not cancel the OpenAI response stream cleanly');
        }
      }
      reader.releaseLock();
    }
  }

  return {
    name: 'openai',
    generateResponse,
    streamResponse,
    generateReply: generateResponse,
  };
}

export default createOpenAIProvider;
