import config from '../../config/env.js';
import ApiError from '../../utils/ApiError.js';

const BATCH_SIZE = 64;

function mapProviderError(status) {
  if (status === 401 || status === 403) {
    return ApiError.badGateway(
      'AI_EMBEDDINGS_UNAUTHORIZED',
      'The document embedding provider rejected the server credentials.',
    );
  }
  if (status === 429) {
    return ApiError.serviceUnavailable(
      'AI_EMBEDDINGS_RATE_LIMITED',
      'The document embedding provider is rate limiting requests. Please try again shortly.',
    );
  }
  if (status >= 500) {
    return ApiError.serviceUnavailable(
      'AI_EMBEDDINGS_UNAVAILABLE',
      'The document embedding provider is temporarily unavailable.',
    );
  }
  return ApiError.badGateway(
    'AI_EMBEDDINGS_REJECTED_REQUEST',
    'The document embedding provider rejected the request.',
  );
}

export function createOpenAIEmbeddingProvider(overrides = {}) {
  const apiKey = overrides.apiKey ?? config.rag.embeddingApiKey;
  const model = overrides.model ?? config.rag.embeddingModel;
  const dimensions = overrides.dimensions ?? config.rag.embeddingDimensions;
  const timeoutMs = overrides.timeoutMs ?? config.ai.timeoutMs;
  const fetchImpl = overrides.fetchImpl ?? globalThis.fetch;
  const baseUrl = (overrides.baseUrl ?? 'https://api.openai.com/v1').replace(/\/+$/, '');

  async function embedTexts(texts, { signal } = {}) {
    if (!apiKey) {
      throw ApiError.serviceUnavailable(
        'AI_EMBEDDINGS_NOT_CONFIGURED',
        'Document search requires an OpenAI API key configured on the server.',
      );
    }
    if (!Array.isArray(texts) || texts.some((text) => typeof text !== 'string' || !text.trim())) {
      throw ApiError.badRequest('INVALID_EMBEDDING_INPUT', 'Embedding input must contain non-empty text.');
    }

    const vectors = [];
    for (let offset = 0; offset < texts.length; offset += BATCH_SIZE) {
      const batch = texts.slice(offset, offset + BATCH_SIZE);
      let response;
      try {
        response = await fetchImpl(`${baseUrl}/embeddings`, {
          method: 'POST',
          signal: signal
            ? AbortSignal.any([AbortSignal.timeout(timeoutMs), signal])
            : AbortSignal.timeout(timeoutMs),
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            input: batch,
            dimensions,
            encoding_format: 'float',
          }),
        });
      } catch (error) {
        if (signal?.aborted) throw error;
        if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
          throw ApiError.gatewayTimeout(
            'AI_EMBEDDINGS_TIMEOUT',
            'The document embedding provider did not respond in time.',
            { cause: error },
          );
        }
        throw ApiError.serviceUnavailable(
          'AI_EMBEDDINGS_UNAVAILABLE',
          'Could not reach the document embedding provider.',
          { cause: error },
        );
      }

      if (!response.ok) throw mapProviderError(response.status);
      let payload;
      try {
        payload = await response.json();
      } catch (error) {
        throw ApiError.badGateway(
          'AI_EMBEDDINGS_INVALID_RESPONSE',
          'The document embedding provider returned an unreadable response.',
          { cause: error },
        );
      }

      const data = payload?.data;
      if (
        !Array.isArray(data)
        || data.length !== batch.length
        || data.some((item) => (
          !item
          || !Number.isInteger(item.index)
          || item.index < 0
          || item.index >= batch.length
          || !Array.isArray(item.embedding)
          || item.embedding.length !== dimensions
          || item.embedding.some((value) => !Number.isFinite(value))
        ))
      ) {
        throw ApiError.badGateway(
          'AI_EMBEDDINGS_INVALID_RESPONSE',
          'The document embedding provider returned invalid vectors.',
        );
      }
      const ordered = new Array(batch.length);
      for (const { embedding, index } of data) {
        if (ordered[index]) {
          throw ApiError.badGateway(
            'AI_EMBEDDINGS_INVALID_RESPONSE',
            'The document embedding provider returned duplicate vectors.',
          );
        }
        ordered[index] = embedding;
      }
      if (ordered.some((embedding) => !embedding)) {
        throw ApiError.badGateway(
          'AI_EMBEDDINGS_INVALID_RESPONSE',
          'The document embedding provider returned incomplete vectors.',
        );
      }
      ordered.forEach((embedding, index) => {
        vectors[offset + index] = embedding;
      });
    }
    return vectors;
  }

  return {
    name: 'openai-embeddings',
    model,
    dimensions,
    isConfigured: Boolean(apiKey),
    embedTexts,
    async embedQuery(query, options) {
      const [embedding] = await embedTexts([query], options);
      return embedding;
    },
  };
}

export default createOpenAIEmbeddingProvider;
