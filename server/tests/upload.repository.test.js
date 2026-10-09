import { describe, expect, it, vi } from 'vitest';
import { createUploadRepository } from '../src/modules/uploads/upload.repository.js';

describe('upload repository ownership', () => {
  it('checks the authenticated user owns the conversation', async () => {
    const databasePool = {
      query: vi.fn().mockResolvedValue({ rowCount: 1, rows: [{}] }),
    };
    const repository = createUploadRepository({ databasePool });

    await expect(repository.ownsConversation('owner-id', 'conversation-id'))
      .resolves.toBe(true);
    expect(databasePool.query.mock.calls[0][0])
      .toBe('SELECT 1 FROM conversations WHERE user_id = $1 AND id = $2');
    expect(databasePool.query.mock.calls[0][1]).toEqual(['owner-id', 'conversation-id']);
  });

  it('lists only files belonging to the specified user and conversation', async () => {
    const databasePool = {
      query: vi.fn().mockResolvedValue({ rows: [{
        id: 'upload-id',
        conversation_id: 'conversation-id',
        original_name: 'notes.txt',
        content_type: 'text/plain',
        size_bytes: 12,
        created_at: new Date('2026-01-01T00:00:00Z'),
        index_status: 'ready',
      }] }),
    };
    const repository = createUploadRepository({ databasePool });

    await expect(repository.list('owner-id', 'conversation-id')).resolves.toMatchObject([
      { id: 'upload-id', indexStatus: 'ready' },
    ]);

    expect(databasePool.query.mock.calls[0][0]).toContain('c.user_id = $1 AND c.id = $2');
    expect(databasePool.query.mock.calls[0][0]).toContain('LEFT JOIN documents d');
    expect(databasePool.query.mock.calls[0][1]).toEqual(['owner-id', 'conversation-id']);
  });

  it('deletes only an upload joined to a conversation owned by the caller', async () => {
    const databasePool = {
      query: vi.fn().mockResolvedValue({ rows: [{ storage_key: 'private-key' }] }),
    };
    const repository = createUploadRepository({ databasePool });

    await expect(
      repository.delete('owner-id', 'conversation-id', 'upload-id'),
    ).resolves.toBe('private-key');

    expect(databasePool.query.mock.calls[0][0]).toContain('c.user_id = $1');
    expect(databasePool.query.mock.calls[0][1]).toEqual([
      'owner-id',
      'conversation-id',
      'upload-id',
    ]);
  });

  it('stores extracted text alongside the owner-scoped conversation metadata', async () => {
    const databasePool = {
      query: vi.fn().mockResolvedValue({ rows: [{ id: 'file-id' }] }),
    };
    const repository = createUploadRepository({ databasePool });

    await repository.create('owner-id', 'conversation-id', {
      id: 'storage-key',
      name: 'notes.txt',
      contentType: 'text/plain',
      size: 12,
      extractedText: 'document text',
    });

    expect(databasePool.query.mock.calls[0][0]).toContain('extracted_text');
    expect(databasePool.query.mock.calls[0][0]).toContain('c.user_id = $2');
    expect(databasePool.query.mock.calls[0][1]).toEqual([
      'conversation-id',
      'owner-id',
      'storage-key',
      'notes.txt',
      'text/plain',
      12,
      'document text',
    ]);
  });

  it('loads chat files through authenticated conversation ownership', async () => {
    const databasePool = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    };
    const repository = createUploadRepository({ databasePool });

    await repository.findForChat('owner-id', 'conversation-id', ['file-id']);

    expect(databasePool.query.mock.calls[0][0])
      .toContain('WHERE c.user_id = $1 AND c.id = $2 AND f.id = ANY($3::uuid[])');
    expect(databasePool.query.mock.calls[0][1])
      .toEqual(['owner-id', 'conversation-id', ['file-id']]);
  });
});
