import config from '../../config/env.js';
import ApiError from '../../utils/ApiError.js';

const TAVILY_SEARCH_URL = 'https://api.tavily.com/search';
const MAX_CONTENT_LENGTH = 8000;
const MAX_TOTAL_CONTENT_LENGTH = 24000;

function hostIsAllowed(hostname, allowedDomains) {
  const host = hostname.toLowerCase();
  return allowedDomains.some((domain) => {
    const normalized = domain.toLowerCase().replace(/^\./, '');
    return host === normalized || host.endsWith(`.${normalized}`);
  });
}

function toSearchResult(result, allowedDomains) {
  if (typeof result?.title !== 'string' || typeof result?.url !== 'string') return null;

  let url;
  try {
    url = new URL(result.url);
  } catch {
    return null;
  }
  if (
    url.protocol !== 'https:'
    || url.username
    || url.password
    || url.port
    || !hostIsAllowed(url.hostname, allowedDomains)
  ) {
    return null;
  }

  const content = typeof result.raw_content === 'string' && result.raw_content.trim()
    ? result.raw_content
    : result.content;
  if (typeof content !== 'string' || !content.trim()) return null;

  return {
    title: result.title.trim().slice(0, 300),
    url: url.href,
    content: content.trim().slice(0, MAX_CONTENT_LENGTH),
  };
}

export function createWebSearchService({
  apiKey = config.webSearch.apiKey,
  allowedDomains = config.webSearch.allowedDomains,
  maxResults = config.webSearch.maxResults,
  fetchImpl = globalThis.fetch,
  timeoutMs = config.ai.timeoutMs,
} = {}) {
  async function searchWeb(query, { signal } = {}) {
    if (!apiKey) {
      throw ApiError.serviceUnavailable(
        'WEB_SEARCH_NOT_CONFIGURED',
        'Web search is not configured on the server.',
      );
    }
    if (typeof query !== 'string' || query.trim().length < 2 || query.length > 200) {
      throw ApiError.badRequest(
        'INVALID_WEB_SEARCH_QUERY',
        'The web search query must be between 2 and 200 characters.',
      );
    }

    let response;
    try {
      response = await fetchImpl(TAVILY_SEARCH_URL, {
        method: 'POST',
        signal: signal
          ? AbortSignal.any([AbortSignal.timeout(timeoutMs), signal])
          : AbortSignal.timeout(timeoutMs),
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          api_key: apiKey,
          query: query.trim(),
          topic: 'general',
          search_depth: 'advanced',
          max_results: maxResults,
          include_raw_content: 'text',
          include_domains: allowedDomains,
        }),
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
        throw ApiError.gatewayTimeout(
          'WEB_SEARCH_TIMEOUT',
          'The web search provider did not respond in time.',
          { cause: error },
        );
      }
      throw ApiError.serviceUnavailable(
        'WEB_SEARCH_UNAVAILABLE',
        'Could not reach the web search provider.',
        { cause: error },
      );
    }

    if (!response.ok) {
      if (response.status === 429) {
        throw ApiError.serviceUnavailable(
          'WEB_SEARCH_RATE_LIMITED',
          'The web search provider is rate limiting requests. Please try again shortly.',
        );
      }
      if (response.status >= 500) {
        throw ApiError.serviceUnavailable(
          'WEB_SEARCH_UNAVAILABLE',
          'The web search provider is temporarily unavailable.',
        );
      }
      throw ApiError.badGateway(
        'WEB_SEARCH_REJECTED_REQUEST',
        'The web search provider rejected the request.',
      );
    }

    let payload;
    try {
      payload = await response.json();
    } catch (error) {
      throw ApiError.badGateway(
        'WEB_SEARCH_INVALID_RESPONSE',
        'The web search provider returned an unreadable response.',
        { cause: error },
      );
    }
    if (!Array.isArray(payload?.results)) {
      throw ApiError.badGateway(
        'WEB_SEARCH_INVALID_RESPONSE',
        'The web search provider returned invalid search results.',
      );
    }

    const results = [];
    let totalContentLength = 0;
    for (const result of payload.results) {
      if (results.length >= maxResults || totalContentLength >= MAX_TOTAL_CONTENT_LENGTH) break;
      const source = toSearchResult(result, allowedDomains);
      if (!source) continue;
      source.content = source.content.slice(0, MAX_TOTAL_CONTENT_LENGTH - totalContentLength);
      totalContentLength += source.content.length;
      results.push(source);
    }
    return results;
  }

  return { searchWeb };
}

export default createWebSearchService;
