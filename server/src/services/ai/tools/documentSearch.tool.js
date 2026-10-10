import { z } from 'zod';

export function createDocumentSearchTool({ searchDocuments }) {
  if (typeof searchDocuments !== 'function') {
    throw new TypeError('documentSearch tool requires a document search handler.');
  }

  return {
    name: 'documentSearch',
    description: 'Search relevant passages in the user’s attached documents.',
    inputSchema: z.object({
      query: z.string().trim().min(2).max(200),
    }).strict(),
    inputSchemaJson: {
      type: 'object',
      properties: { query: { type: 'string', minLength: 2, maxLength: 200 } },
      required: ['query'],
      additionalProperties: false,
    },
    permissions: ['document:search'],
    handler: ({ query }, context = {}) => searchDocuments(query, context),
  };
}

export default createDocumentSearchTool;
