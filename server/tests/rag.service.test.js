import { describe, expect, it, vi } from 'vitest';
import { createRagService } from '../src/modules/rag/rag.service.js';

describe('RAG service', () => {
  it('chunks and indexes extracted text with batched embeddings', async () => {
    const repository = {
      ensureDocument: vi.fn().mockResolvedValue({ id: 'doc-1', status: 'pending' }),
      replaceChunks: vi.fn(),
      markFailed: vi.fn(),
      searchSimilar: vi.fn(),
    };
    const embeddingProvider = {
      model: 'embedding-model',
      isConfigured: true,
      embedTexts: vi.fn(async (chunks) => chunks.map(() => [0.1, 0.2])),
      embedQuery: vi.fn(),
    };
    const service = createRagService({
      repository,
      embeddingProvider,
      settings: { chunkSize: 32, chunkOverlap: 4, topK: 4, similarityThreshold: 0.3 },
    });

    await expect(service.indexDocument({
      userId: 'user-1',
      conversationId: 'conversation-1',
      uploadId: 'upload-1',
      text: 'A detailed report about semantic search. '.repeat(4),
    })).resolves.toEqual({ status: 'ready' });

    expect(embeddingProvider.embedTexts).toHaveBeenCalledOnce();
    const [write] = repository.replaceChunks.mock.calls[0];
    expect(write.documentId).toBe('doc-1');
    expect(write.chunks.length).toBeGreaterThan(1);
    expect(write.vectors).toHaveLength(write.chunks.length);
    expect(write.model).toBe('embedding-model');
    expect(write.chunkSize).toBe(32);
    expect(write.chunkOverlap).toBe(4);
  });

  it('keeps extracted documents pending when embeddings are not configured', async () => {
    const repository = {
      ensureDocument: vi.fn().mockResolvedValue({ id: 'doc-1', status: 'pending' }),
      replaceChunks: vi.fn(),
      markFailed: vi.fn(),
    };
    const service = createRagService({
      repository,
      embeddingProvider: {
        model: 'embedding-model',
        isConfigured: false,
        embedTexts: vi.fn(),
      },
      settings: { chunkSize: 1200, chunkOverlap: 200 },
    });

    await expect(service.indexDocument({
      userId: 'user-1',
      conversationId: 'conversation-1',
      uploadId: 'upload-1',
      text: 'Readable document text.',
    })).resolves.toEqual({ status: 'pending' });
    expect(repository.replaceChunks).not.toHaveBeenCalled();
  });

  it('does not send an unindexed full document to the model when search is unconfigured', async () => {
    const repository = {
      ensureDocument: vi.fn().mockResolvedValue({ id: 'doc-1', status: 'pending' }),
    };
    const service = createRagService({
      repository,
      embeddingProvider: {
        model: 'embedding-model',
        isConfigured: false,
        embedTexts: vi.fn(),
        embedQuery: vi.fn(),
      },
      settings: { chunkSize: 1200, chunkOverlap: 200 },
    });

    await expect(service.retrieveContext({
      userId: 'user-1',
      conversationId: 'conversation-1',
      files: [{
        id: 'upload-1',
        contentType: 'text/plain',
        extractedText: 'Private full document content.',
      }],
      query: 'Find something.',
    })).rejects.toMatchObject({
      code: 'AI_EMBEDDINGS_NOT_CONFIGURED',
      statusCode: 503,
    });
  });

  it('embeds the question once and searches only the authenticated conversation uploads', async () => {
    const hits = [{
      uploadId: 'upload-1',
      fileName: 'report.md',
      chunkIndex: 2,
      pageNumber: null,
      sectionTitle: 'Results',
      content: 'Relevant evidence.',
      similarity: 0.8,
    }];
    const repository = {
      ensureDocument: vi.fn().mockResolvedValue({
        id: 'doc-1',
        status: 'ready',
        embedding_model: 'embedding-model',
        chunk_size: 1200,
        chunk_overlap: 200,
      }),
      searchSimilar: vi.fn().mockResolvedValue(hits),
    };
    const embeddingProvider = {
      model: 'embedding-model',
      isConfigured: true,
      embedTexts: vi.fn(),
      embedQuery: vi.fn().mockResolvedValue([0.4, 0.5]),
    };
    const service = createRagService({
      repository,
      embeddingProvider,
      settings: { chunkSize: 1200, chunkOverlap: 200, topK: 3, similarityThreshold: 0.4 },
    });

    await expect(service.retrieveContext({
      userId: 'user-1',
      conversationId: 'conversation-1',
      files: [{
        id: 'upload-1',
        name: 'report.md',
        contentType: 'text/markdown',
        extractedText: 'Full text stays in storage.',
      }],
      query: 'What were the results?',
    })).resolves.toEqual(hits);

    expect(embeddingProvider.embedQuery).toHaveBeenCalledWith('What were the results?', {
      signal: undefined,
    });
    expect(repository.searchSimilar).toHaveBeenCalledWith({
      userId: 'user-1',
      conversationId: 'conversation-1',
      uploadIds: ['upload-1'],
      embedding: [0.4, 0.5],
      embeddingModel: 'embedding-model',
      topK: 3,
      similarityThreshold: 0.4,
    });
  });

  it('surfaces provider failures and marks the index as failed', async () => {
    const providerError = new Error('provider unavailable');
    const repository = {
      ensureDocument: vi.fn().mockResolvedValue({ id: 'doc-1', status: 'pending' }),
      markFailed: vi.fn(),
    };
    const service = createRagService({
      repository,
      embeddingProvider: {
        model: 'embedding-model',
        isConfigured: true,
        embedTexts: vi.fn().mockRejectedValue(providerError),
      },
      settings: { chunkSize: 1200, chunkOverlap: 200 },
    });

    await expect(service.indexDocument({
      userId: 'user-1',
      conversationId: 'conversation-1',
      uploadId: 'upload-1',
      text: 'Extracted text.',
    })).rejects.toBe(providerError);
    expect(repository.markFailed).toHaveBeenCalledWith({
      documentId: 'doc-1',
      userId: 'user-1',
      conversationId: 'conversation-1',
    });
  });
});
