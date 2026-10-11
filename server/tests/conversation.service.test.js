// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createConversationService, deriveTitle } from '../src/modules/conversations/conversation.service.js';

describe('conversation service', () => {
  it("creates concise titles from a user's first message", () => {
    expect(deriveTitle('  Help me plan\n a weekend trip  ')).toBe(
      'Help me plan a weekend trip',
    );
    expect(deriveTitle('x'.repeat(80))).toBe(`${'x'.repeat(47)}…`);
    expect(deriveTitle('  ')).toBe('New chat');
  });

  it('derives a title from the first user message when appending', async () => {
    const repository = {
      addMessage: vi.fn().mockResolvedValue({ conversation: {}, message: {} }),
    };
    const service = createConversationService({ repository });

    await service.addMessage('user-id', 'conversation-id', {
      role: 'user',
      content: 'Find me a quiet cafe',
    });

    expect(repository.addMessage).toHaveBeenCalledWith(
      'user-id',
      'conversation-id',
      {
        role: 'user',
        content: 'Find me a quiet cafe',
        title: 'Find me a quiet cafe',
      },
    );
  });

  it('removes conversation files from private storage after deleting the conversation', async () => {
    const repository = {
      delete: vi.fn().mockResolvedValue(true),
    };
    const uploadService = {
      listStorageKeysForConversation: vi.fn().mockResolvedValue(['private-file-key']),
      removeStorageKeys: vi.fn(),
    };
    const service = createConversationService({ repository, uploadService });

    await expect(service.remove('owner-id', 'conversation-id')).resolves.toBe(true);

    expect(uploadService.listStorageKeysForConversation).toHaveBeenCalledWith(
      'owner-id',
      'conversation-id',
    );
    expect(repository.delete).toHaveBeenCalledWith('owner-id', 'conversation-id');
    expect(uploadService.removeStorageKeys).toHaveBeenCalledWith(['private-file-key']);
    expect(repository.delete.mock.invocationCallOrder[0]).toBeLessThan(
      uploadService.removeStorageKeys.mock.invocationCallOrder[0],
    );
  });

  it('passes archive options to the repository when listing', async () => {
    const repository = { list: vi.fn().mockResolvedValue([]) };
    const service = createConversationService({ repository });

    await service.list('owner-id', { includeArchived: true });

    expect(repository.list).toHaveBeenCalledWith('owner-id', { includeArchived: true });
  });

  it('archives and restores a conversation through the repository', async () => {
    const repository = {
      setArchived: vi.fn().mockResolvedValue({ id: 'conversation-id', archivedAt: new Date() }),
    };
    const service = createConversationService({ repository });

    await service.setArchived('owner-id', 'conversation-id', true);

    expect(repository.setArchived).toHaveBeenCalledWith(
      'owner-id',
      'conversation-id',
      true,
    );
  });
});
