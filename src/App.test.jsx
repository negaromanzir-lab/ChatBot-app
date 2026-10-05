import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from './App';
import * as chatService from './features/chat/services/chatService.js';

/**
 * Integration test for the App wiring.
 *
 * The AI call is mocked at the service boundary rather than at the `fetch`
 * layer, so these tests cover the real conversation hook, the real UI
 * components, and the real shape the service is asked for — without any
 * network. The service's own request/response mapping is covered separately in
 * chatService.test.js.
 */
vi.mock('./features/chat/services/chatService.js', async (importOriginal) => ({
  ...(await importOriginal()),
  requestAssistantReply: vi.fn(),
}));

function mockReply(content) {
  vi.mocked(chatService.requestAssistantReply).mockResolvedValue({
    id: 'reply-id',
    sender: 'robot',
    message: content,
  });
}

async function sendMessage(text) {
  const input = screen.getByLabelText('Message');
  fireEvent.change(input, { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: /send/i }));
}

describe('App', () => {
  it('renders the seeded conversation', () => {
    mockReply('unused');
    render(<App />);

    expect(screen.getByText('hello chatbot')).toBeInTheDocument();
    expect(screen.getByText('Hello! How can I help you?')).toBeInTheDocument();
    expect(screen.getByText('Today is September 27')).toBeInTheDocument();
  });

  it('sends the whole conversation and renders the reply', async () => {
    mockReply('A backend reply');
    render(<App />);

    await sendMessage('How are you?');

    // The full history is sent, not just the new turn.
    expect(chatService.requestAssistantReply).toHaveBeenCalledTimes(1);
    const { messages } = vi.mocked(chatService.requestAssistantReply).mock.calls[0][0];
    expect(messages.map((m) => m.message)).toEqual([
      'hello chatbot',
      'Hello! How can I help you?',
      'can you get me todays date?',
      'Today is September 27',
      'How are you?',
    ]);

    expect(await screen.findByText('A backend reply')).toBeInTheDocument();
    expect(screen.getByText('How are you?')).toBeInTheDocument();
  });

  it('clears the composer after sending', async () => {
    mockReply('A backend reply');
    render(<App />);

    await sendMessage('How are you?');

    await waitFor(() => {
      expect(screen.getByLabelText('Message')).toHaveValue('');
    });
  });

  it('surfaces a backend error instead of inventing a reply', async () => {
    vi.mocked(chatService.requestAssistantReply).mockRejectedValue(
      new Error('Could not reach the server. Check that the backend is running.'),
    );
    render(<App />);

    await sendMessage('How are you?');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not reach the server');

    // The user's message is kept, and no assistant reply is fabricated.
    expect(screen.getByText('How are you?')).toBeInTheDocument();
    expect(screen.queryByText('A backend reply')).not.toBeInTheDocument();
  });

  it('ignores an empty submission', () => {
    mockReply('unused');
    render(<App />);

    // Send is disabled while the draft is empty.
    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Message'), { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled();
  });

  it('submits on Enter', async () => {
    mockReply('A backend reply');
    render(<App />);

    const input = screen.getByLabelText('Message');
    fireEvent.change(input, { target: { value: 'Sent with Enter' } });
    fireEvent.submit(input.closest('form'));

    expect(await screen.findByText('A backend reply')).toBeInTheDocument();
    expect(chatService.requestAssistantReply).toHaveBeenCalledTimes(1);
  });
});