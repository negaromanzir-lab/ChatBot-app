import ApiError from '../../../utils/ApiError.js';
import logger from '../../../config/logger.js';

export function createRequestSignal(timeoutMs, callerSignal) {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  return callerSignal ? AbortSignal.any([callerSignal, timeoutSignal]) : timeoutSignal;
}

export function mapProviderStatus(status) {
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

export function mapProviderRequestError(error, timeoutMs, callerSignal, provider) {
  if (error instanceof ApiError || callerSignal?.aborted) return error;
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
    logger.warn({ timeoutMs, provider }, 'AI provider request timed out');
    return ApiError.gatewayTimeout(
      'AI_PROVIDER_TIMEOUT',
      'The AI provider did not respond in time. Please try again.',
      { cause: error },
    );
  }

  logger.error(
    { provider, errorName: error?.name ?? 'Error' },
    'AI provider request failed',
  );
  return ApiError.badGateway(
    'AI_PROVIDER_UNREACHABLE',
    'Could not reach the AI provider.',
  );
}

export async function* readSseData(response, provider, { signal, timeoutMs } = {}) {
  if (!response.body) {
    throw ApiError.badGateway(
      'AI_PROVIDER_INVALID_RESPONSE',
      'The AI provider returned an unreadable response.',
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let completed = false;

  function* extractData(lines) {
    let dataLines = [];
    for (const line of lines) {
      if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trimStart());
      } else if (!line.trim() && dataLines.length) {
        yield dataLines.join('\n');
        dataLines = [];
      }
    }
    if (dataLines.length) yield dataLines.join('\n');
  }

  try {
    while (true) {
      let result;
      try {
        result = await reader.read();
      } catch (error) {
        throw mapProviderRequestError(error, timeoutMs, signal, provider);
      }
      buffer += decoder.decode(result.value ?? new Uint8Array(), { stream: !result.done });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const data of extractData(lines)) {
        if (data === '[DONE]') {
          completed = true;
          return;
        }
        if (data) yield data;
      }
      if (result.done) {
        completed = true;
        break;
      }
    }

    if (buffer.startsWith('data:')) {
      const lastData = buffer.slice(5).trim();
      if (lastData && lastData !== '[DONE]') yield lastData;
    }
  } finally {
    if (!completed) {
      try {
        await reader.cancel();
      } catch (error) {
        logger.warn({ err: error, provider }, 'Could not cancel provider stream cleanly');
      }
    }
    reader.releaseLock();
  }
}

/**
 * Normalizes the per-vendor token-usage reports into one shape.
 *
 * Providers expose usage differently (`prompt_tokens`/`completion_tokens` on
 * OpenAI, `usageMetadata.promptTokenCount` on Gemini, `input_tokens`/
 * `output_tokens` on Claude). Only fields the vendor actually reported are
 * included, and `null` is returned when nothing usable was present, so callers
 * never print fabricated zero counts.
 */
export function normalizeUsage(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const input = raw.prompt_tokens ?? raw.promptTokenCount ?? raw.input_tokens;
  const output = raw.completion_tokens ?? raw.candidatesTokenCount ?? raw.output_tokens;
  const total = raw.total_tokens ?? raw.totalTokenCount
    ?? (Number.isFinite(input) && Number.isFinite(output) ? input + output : undefined);

  const usage = {};
  if (Number.isFinite(input)) usage.inputTokens = input;
  if (Number.isFinite(output)) usage.outputTokens = output;
  if (Number.isFinite(total)) usage.totalTokens = total;

  return Object.keys(usage).length ? usage : null;
}

export function parseSseJson(data, provider) {
  try {
    return JSON.parse(data);
  } catch (error) {
    logger.error({ err: error, provider }, 'AI provider returned malformed stream data');
    throw ApiError.badGateway(
      'AI_PROVIDER_INVALID_RESPONSE',
      'The AI provider returned an unreadable response.',
      { cause: error },
    );
  }
}
