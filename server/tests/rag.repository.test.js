import { describe, expect, it, vi } from 'vitest';
import { createRagRepository } from '../src/modules/rag/rag.repository.js';

describe('RAG repository', () => {
  it('creates documents only from uploads in the authenticated user conversation', async () => {
    const databasePool = {
      query: vi.fn().mockResolvedValue({ rows: [{ id: 'doc-1', status: 'pending' }] }),
    };
    const repository = createRagRepository({ databasePool });

    await expect(repository.ensureDocument({
      userId: 'user-1',
      conversationId: 'conversation-1',
      uploadId: 'upload-1',
    })).resolves.toEqual({ id: 'doc-1', status: 'pending' });

    const [query, values] = databasePool.query.mock.calls[0];
    expect(query).toContain('c.user_id = $3');
    expect(query).toContain('f.id = $1 AND c.id = $2');
    expect(values).toEqual(['upload-1', 'conversation-1', 'user-1']);
  });

  it('applies user, conversation, document, threshold, and top-k filters to vector search', async () => {
    const databasePool = {
      query: vi.fn().mockResolvedValue({ rows: [{
        upload_id: 'upload-1',
        original_name: 'notes.md',
        chunk_index: 3,
        page_number: 2,
        section_title: 'Findings',
        content: 'Relevant content',
        similarity: '0.91',
      }] }),
    };
    const repository = createRagRepository({ databasePool });

    await expect(repository.searchSimilar({
      userId: 'user-1',
      conversationId: 'conversation-1',
      uploadIds: ['upload-1'],
      embedding: [0.1, 0.2],
      embeddingModel: 'text-embedding-3-small',
      topK: 4,
      similarityThreshold: 0.45,
    })).resolves.toEqual([{
      uploadId: 'upload-1',
      fileName: 'notes.md',
      chunkIndex: 3,
      pageNumber: 2,
      sectionTitle: 'Findings',
      content: 'Relevant content',
      similarity: 0.91,
    }]);

    const [query, values] = databasePool.query.mock.calls[0];
    expect(query).toContain('d.user_id = $1');
    expect(query).toContain('d.conversation_id = $2');
    expect(query).toContain('d.upload_id = ANY($3::uuid[])');
    expect(query).toContain('vectors.model = $7');
    expect(query).toContain('>= $6');
    expect(query).toContain('LIMIT $5');
    expect(values).toEqual([
      'user-1',
      'conversation-1',
      ['upload-1'],
      '[0.1,0.2]',
      4,
      0.45,
      'text-embedding-3-small',
    ]);
  });

  it('replaces chunks and embeddings in one owned-document transaction', async () => {
    const client = {
      query: vi.fn()
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'doc-1' }] })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({}),
      release: vi.fn(),
    };
    const databasePool = { connect: vi.fn().mockResolvedValue(client) };
    const repository = createRagRepository({ databasePool });

    await repository.replaceChunks({
      documentId: 'doc-1',
      userId: 'user-1',
      conversationId: 'conversation-1',
      chunks: [{
        chunkIndex: 0,
        content: 'Evidence',
        startOffset: 0,
        endOffset: 8,
        pageNumber: 1,
        sectionTitle: 'Summary',
      }],
      vectors: [[0.1, 0.2]],
      model: 'embedding-model',
      chunkSize: 1200,
      chunkOverlap: 200,
    });

    expect(client.query.mock.calls.map(([sql]) => sql.trim())).toEqual([
      'BEGIN',
      expect.stringContaining('UPDATE documents'),
      expect.stringContaining('DELETE FROM document_chunks'),
      expect.stringContaining('jsonb_to_recordset($2::jsonb)'),
      expect.stringContaining('data.embedding::vector'),
      expect.stringContaining("SET status = 'ready'"),
      'COMMIT',
    ]);
    expect(JSON.parse(client.query.mock.calls[3][1][1])).toEqual([{
      chunk_index: 0,
      content: 'Evidence',
      start_offset: 0,
      end_offset: 8,
      page_number: 1,
      section_title: 'Summary',
    }]);
    expect(JSON.parse(client.query.mock.calls[4][1][2])).toEqual([{
      chunk_index: 0,
      embedding: '[0.1,0.2]',
    }]);
    expect(client.release).toHaveBeenCalledOnce();
  });
});
