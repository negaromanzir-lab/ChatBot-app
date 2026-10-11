import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MessageBubble } from './MessageBubble.jsx';

describe('assistant source labels', () => {
  it.each([
    ['A general answer.', 'AI knowledge'],
    ['A sourced answer.\n\n**Web search sources**\n- [W1] [WHO](<https://www.who.int/>)', 'Web search'],
    ['A sourced answer.\n\n**Uploaded document sources**\n- [D1] `guide.pdf` — Page 2', 'Uploaded documents'],
    [
      'A sourced answer.\n\n**Uploaded document sources**\n- [D1] `guide.pdf` — Page 2\n\n**Web search sources**\n- [W1] [WHO](<https://www.who.int/>)',
      'Web search and uploaded documents',
    ],
  ])('labels "%s" as %s', (content, label) => {
    render(
      <MessageBubble
        message={{ sender: 'assistant', message: content }}
        showActions={false}
      />,
    );

    expect(screen.getByLabelText('Answer source type')).toHaveTextContent(label);
  });

  it('supports editing and resubmitting the most recent user message', () => {
    const onEditMessage = vi.fn();
    render(
      <MessageBubble
        message={{ id: 'user-1', sender: 'user', message: 'Original prompt' }}
        canEdit
        onEditMessage={onEditMessage}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit message' }));
    fireEvent.change(screen.getByLabelText('Edit your message'), {
      target: { value: 'Updated prompt' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save and resend' }));

    expect(onEditMessage).toHaveBeenCalledWith('user-1', 'Updated prompt');
  });

  describe('assistant speech playback', () => {
    it('offers play and pause control when speech synthesis is available', () => {
      const toggle = vi.fn();
      const speech = {
        available: true,
        activeMessageId: null,
        isPaused: false,
        toggle,
      };
      const view = render(
        <MessageBubble
          message={{ id: 'assistant-1', sender: 'assistant', message: 'Hello there.' }}
          speech={speech}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Play response audio' }));
      expect(toggle).toHaveBeenCalledWith('assistant-1', 'Hello there.');

      speech.activeMessageId = 'assistant-1';
      speech.isPaused = false;
      view.rerender(
        <MessageBubble
          message={{ id: 'assistant-1', sender: 'assistant', message: 'Hello there.' }}
          speech={speech}
        />,
      );
      expect(screen.getByRole('button', { name: 'Pause response audio' })).toBeInTheDocument();
    });

    it('hides audio controls when speech synthesis is unavailable', () => {
      render(
        <MessageBubble
          message={{ id: 'assistant-2', sender: 'assistant', message: 'Hello there.' }}
          speech={{ available: false }}
        />,
      );
      expect(screen.queryByRole('button', { name: /response audio/i })).not.toBeInTheDocument();
    });
  });
});
