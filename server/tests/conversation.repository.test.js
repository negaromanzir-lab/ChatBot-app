// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createConversationRepository } from '../src/modules/conversations/conversation.repository.js';

describe('conversation repository', () => {
  it('filters every conversation list by its owner', async () => {
    const databasePool = {
      query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    };
    const repository = createConversationRepository({ databasePool });

    await repository.list('owner-id');

    expect(databasePool.query.mock.calls[0][0]).toContain('WHERE c.user_id = $1');
    expect(databasePool.query.mock.calls[0][1]).toEqual(['owner-id']);
  });

  it('checks ownership while locking before inserting a message', async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({
          rows: [{
            id: 'conversation-id',
            title: 'New chat',
          }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({
          rows: [{
            id: 'message-id',
            conversation_id: 'conversation-id',
            role: 'user',
            content: 'Hello',
            created_at: new Date(),
          }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({
          rows: [{
            id: 'conversation-id',
            user_id: 'owner-id',
            title: 'Hello',
            created_at: new Date(),
            updated_at: new Date(),
          }],
          rowCount: 1,
        }),
      release: vi.fn(),
    };
    const databasePool = {
      connect: vi.fn().mockResolvedValue(client),
    };
    const repository = createConversationRepository({ databasePool });

    const result = await repository.addMessage('owner-id', 'conversation-id', {
      role: 'user',
      content: 'Hello',
      title: 'Hello',
    });

    expect(client.query.mock.calls[1][0]).toContain(
      'WHERE id = $1 AND user_id = $2',
    );
    expect(client.query.mock.calls[1][1]).toEqual(['conversation-id', 'owner-id']);
    expect(result.message.content).toBe('Hello');
    expect(client.query).toHaveBeenLastCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('updates an owned user message and removes later turns in one transaction', async () => {
    const client = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({
          rows: [{ id: 'conversation-id', user_id: 'owner-id', title: 'Old title' }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({
          rows: [{ id: 'message-id', role: 'user', created_at: new Date() }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 2 })
        .mockResolvedValueOnce({
          rows: [{
            id: 'message-id',
            conversation_id: 'conversation-id',
            role: 'user',
            content: 'Edited prompt',
            created_at: new Date(),
          }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({
          rows: [{
            id: 'conversation-id',
            user_id: 'owner-id',
            title: 'Edited prompt',
            created_at: new Date(),
            updated_at: new Date(),
          }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }),
      release: vi.fn(),
    };
    const databasePool = { connect: vi.fn().mockResolvedValue(client) };
    const repository = createConversationRepository({ databasePool });

    const result = await repository.updateUserMessage(
      'owner-id',
      'conversation-id',
      'message-id',
      { content: 'Edited prompt', title: 'Edited prompt' },
    );

    expect(client.query.mock.calls[1][1]).toEqual(['conversation-id', 'owner-id']);
    expect(client.query.mock.calls[3][0]).toContain('DELETE FROM messages');
    expect(result.message.content).toBe('Edited prompt');
    expect(result.conversation.title).toBe('Edited prompt');
    expect(client.query).toHaveBeenLastCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalledOnce();
  });
});
