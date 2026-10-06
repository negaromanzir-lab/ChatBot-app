import ApiError from '../../../utils/ApiError.js';
import config from '../../../config/env.js';
import logger from '../../../config/logger.js';

/**
 * Adapter for any OpenAI-compatible `/chat/completions` endpoint.
 *
 * Keeping the wire format generic (base URL + model + key) means switching
 * vendors is a config change: point AI_PROVIDER_BASE_URL at Groq, OpenRouter,
 * a local Ollama/LM Studio server, etc. No code change and no new dependency.
 *
 * The API key is only ever read here, on the server, and is attached as an
 * Authorization header. It is never logged, never returned, and never leaves
 * this module.
 */
export function createOpenAICompatibleProvider(overrides = {}) {
  const settings = {
    baseUrl: overrides.baseUrl ?? config.ai.baseUrl,
    model: overrides.model ?? config.ai.model,
    apiKey: overrides.apiKey ?? config.ai.apiKey,
    timeoutMs: overrides.timeoutMs ?? config.ai.timeoutMs,
    maxTokens: overrides.maxTokens ?? config.ai.maxTokens,
    fetchImpl: overrides.fetchImpl ?? globalThis.fetch,
  };

  // Normalised here as well as in config/env.js: this factory is also called
  // directly with overrides, and a trailing slash would produce a "//chat"
  // path that some gateways reject.
  settings.baseUrl = String(settings.baseUrl).replace(/\/+$/, '');

  if (!settings.apiKey) {
    throw ApiError.serviceUnavailable(
      'AI_PROVIDER_NOT_CONFIGURED',
      'The AI provider is not configured on the server.',
    );
  }

  return {
    name: 'openai-compatible',

    async generateReply(messages) {
      const url = `${settings.baseUrl}/chat/completions`;

      // Bound the provider call so a hanging upstream cannot pin a request
      // open until the client gives up.
      const signal = AbortSignal.timeout(settings.timeoutMs);

      let response;
      try {
        response = await settings.fetchImpl(url, {
          method: 'POST',
          signal,
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${settings.apiKey}`,
          },
          body: JSON.stringify({
            model: settings.model,
            messages,
            max_tokens: settings.maxTokens,
          }),
        });
      } catch (error) {
        if (error.name === 'TimeoutError' || error.name === 'AbortError') {
          logger.warn(
            { timeoutMs: settings.timeoutMs, model: settings.model },
            'AI provider request timed out',
          );
          throw ApiError.gatewayTimeout(
            'AI_PROVIDER_TIMEOUT',
            'The AI provider did not respond in time. Please try again.',
            { cause: error },
          );
        }

        logger.error({ err: error }, 'AI provider request failed');
        throw ApiError.badGateway(
          'AI_PROVIDER_UNREACHABLE',
          'Could not reach the AI provider.',
          { cause: error },
        );
      }

      if (!response.ok) {
        // The upstream body can echo the request or contain vendor internals,
        // so log it server-side and return a generic message to the client.
        const upstreamBody = await response.text().catch(() => '');
        logger.error(
          {
            status: response.status,
            model: settings.model,
            upstreamBody: upstreamBody.slice(0, 500),
          },
          'AI provider returned an error status',
        );

        if (response.status === 401 || response.status === 403) {
          throw ApiError.badGateway(
            'AI_PROVIDER_UNAUTHORIZED',
            'The AI provider rejected the server credentials.',
          );
        }
        if (response.status === 429) {
          throw ApiError.serviceUnavailable(
            'AI_PROVIDER_RATE_LIMITED',
            'The AI provider is rate limiting requests. Please try again shortly.',
          );
        }
        if (response.status >= 500) {
          throw ApiError.serviceUnavailable(
            'AI_PROVIDER_UNAVAILABLE',
            'The AI provider is currently unavailable.',
          );
        }
        throw ApiError.badGateway(
          'AI_PROVIDER_REJECTED_REQUEST',
          'The AI provider rejected the request.',
        );
      }

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
        logger.error(
          { model: settings.model },
          'AI provider response contained no message content',
        );
        throw ApiError.badGateway(
          'AI_PROVIDER_EMPTY_RESPONSE',
          'The AI provider returned an empty response.',
        );
      }

      return { role: 'assistant', content };
    },
  };
}

export default createOpenAICompatibleProvider;