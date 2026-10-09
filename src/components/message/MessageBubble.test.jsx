import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
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
});
