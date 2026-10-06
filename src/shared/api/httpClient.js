/**
 * Minimal fetch wrapper for talking to the backend API.
 *
 * Responsibilities kept deliberately narrow: build the URL, apply a timeout,
 * and turn any non-2xx response into a single `ApiClientError` shape. Callers
 * should not have to know about `Response`, `res.ok`, or JSON parsing.
 *
 * No secret is ever read here — the browser only ever sends the user's own
 * messages. AI credentials live exclusively in the server process.
 */

export class ApiClientError extends Error {
  constructor(message, { status = 0, code = 'NETWORK_ERROR', details } = {}) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** True when the request never reached the server, or the server is down. */
  get isNetworkError() {
    return this.status === 0;
  }
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '/api').replace(/\/+$/, '');
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * @param {string} path   Path relative to the API base, e.g. '/chat'
 * @param {object} [options]
 * @param {'GET'|'POST'} [options.method]
 * @param {unknown} [options.body]    Serialized as JSON when present.
 * @param {AbortSignal} [options.signal] Caller-supplied cancellation.
 * @param {number} [options.timeoutMs]
 */
export async function apiRequest(path, options = {}) {
  const {
    method = 'GET',
    body,
    signal,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = options;

  // Combined timeout: whichever fires first wins, so a caller cancelling still
  // aborts even though the timeout signal is always present.
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const combinedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: combinedSignal,
    });
  } catch (error) {
    if (signal?.aborted) {
      throw new ApiClientError('Request cancelled.', { code: 'CANCELLED' });
    }
    if (timeoutSignal.aborted) {
      throw new ApiClientError(
        'The server took too long to respond. Please try again.',
        { code: 'TIMEOUT' },
      );
    }
    throw new ApiClientError(
      'Could not reach the server. Check that the backend is running.',
      { code: 'NETWORK_ERROR', cause: error },
    );
  }

  if (response.status === 204) {
    return null;
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // A non-JSON body (proxy error page, gateway timeout) still needs to
    // produce a useful message rather than a parse crash.
    if (!response.ok) {
      throw new ApiClientError(
        `The server returned an unexpected response (HTTP ${response.status}).`,
        { status: response.status, code: 'INVALID_RESPONSE' },
      );
    }
    return null;
  }

  if (!response.ok) {
    throw new ApiClientError(
      payload?.error?.message ?? `Request failed (HTTP ${response.status}).`,
      {
        status: response.status,
        code: payload?.error?.code ?? 'UNKNOWN',
        details: payload?.error?.details,
      },
    );
  }

  return payload;
}

export { API_BASE_URL };