// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createWebSearchService } from '../src/modules/web-search/webSearch.service.js';

describe('web search service', () => {
  it('uses the configured provider and returns bounded excerpts from approved HTTPS domains only', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      results: [
        {
          title: 'Trusted result',
          url: 'https://www.who.int/health/topic',
          content: 'Short provider summary.',
          raw_content: 'Full extracted page text.',
        },
        {
          title: 'Unapproved result',
          url: 'https://example.com/page',
          content: 'This page must be excluded.',
        },
        {
          title: 'Unsafe scheme',
          url: 'http://www.who.int/page',
          content: 'This page must be excluded.',
        },
        {
          title: 'Credential URL',
          url: 'https://user:pass@who.int/page',
          content: 'This page must be excluded.',
        },
      ],
    })));
    const service = createWebSearchService({
      apiKey: 'server-test-key',
      allowedDomains: ['who.int'],
      maxResults: 3,
      fetchImpl,
    });

    await expect(service.searchWeb('current health guidance')).resolves.toEqual([{
      title: 'Trusted result',
      url: 'https://www.who.int/health/topic',
      content: 'Full extracted page text.',
    }]);

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl.mock.calls[0][0]).toBe('https://api.tavily.com/search');
    const payload = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(payload).toMatchObject({
      api_key: 'server-test-key',
      query: 'current health guidance',
      include_domains: ['who.int'],
      max_results: 3,
      include_raw_content: 'text',
    });
  });

  it('limits extracted text and rejects empty or oversized queries', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      results: [{
        title: 'Long page',
        url: 'https://who.int/page',
        raw_content: 'x'.repeat(9000),
      }],
    })));
    const service = createWebSearchService({
      apiKey: 'server-test-key',
      allowedDomains: ['who.int'],
      fetchImpl,
    });

    const [result] = await service.searchWeb('health');
    expect(result.content).toHaveLength(8000);
    await expect(service.searchWeb('')).rejects.toMatchObject({
      code: 'INVALID_WEB_SEARCH_QUERY',
      statusCode: 400,
    });
    await expect(service.searchWeb('q'.repeat(201))).rejects.toMatchObject({
      code: 'INVALID_WEB_SEARCH_QUERY',
      statusCode: 400,
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('surfaces provider errors without exposing upstream response content', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('secret provider response', {
      status: 429,
    }));
    const service = createWebSearchService({
      apiKey: 'server-test-key',
      allowedDomains: ['who.int'],
      fetchImpl,
    });

    await expect(service.searchWeb('health')).rejects.toMatchObject({
      code: 'WEB_SEARCH_RATE_LIMITED',
      statusCode: 503,
    });
  });
});
