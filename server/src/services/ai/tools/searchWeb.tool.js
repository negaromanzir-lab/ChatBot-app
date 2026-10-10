import { z } from 'zod';

export function createSearchWebTool({ searchWeb }) {
  if (typeof searchWeb !== 'function') {
    throw new TypeError('searchWeb tool requires a search handler.');
  }

  return {
    name: 'searchWeb',
    description: 'Search current information on server-approved trusted web sources.',
    inputSchema: z.object({
      query: z.string().trim().min(2).max(200),
    }).strict(),
    inputSchemaJson: {
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 2, maxLength: 200 },
      },
      required: ['query'],
      additionalProperties: false,
    },
    permissions: ['web:search'],
    handler: ({ query }, { signal } = {}) => searchWeb(query, { signal }),
  };
}

export default createSearchWebTool;
