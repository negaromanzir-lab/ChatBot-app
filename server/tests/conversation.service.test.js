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
});
