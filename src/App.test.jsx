import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from './App';
import * as chatService from './services/chatService.js';
import { clearConversations } from './services/conversationStorage.js';
import { removeKey } from './services/localStorage.js';
import { THEME_STORAGE_KEY } from './hooks/useTheme.js';

/**
 * Integration test for the App wiring.
 *
 * The AI call is mocked at the service boundary rather than at the `fetch`
 * layer, so these tests cover the real page composition, the real components,
 * and the real shape the service is asked for — without any network. The
 * service's own request/response mapping is covered separately in
 * chatService.test.js.
 *
 * localStorage is cleared per test because conversation history is persisted:
 * without it, a conversation created by one test would change the empty-state
 * shown by the next.
 */
vi.mock('./services/chatService.js', async (importOriginal) => ({
  ...(await importOriginal()),
  streamAssistantReply: vi.fn(),
}));

function mockReply(content = 'A backend reply') {
  vi.mocked(chatService.streamAssistantReply).mockResolvedValue({
    id: 'reply-id',
    sender: 'robot',
    message: content,
    createdAt: Date.now(),
    status: 'complete',
  });
}

function composer() {
  return screen.getByLabelText('Message');
}

/**
 * The transcript region. Message text is asserted inside it because the same
 * text also appears in the sidebar as the conversation's title.
 */
function transcript() {
  return within(screen.getByRole('log'));
}

async function sendMessage(text) {
  fireEvent.change(composer(), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: /send/i }));
}

beforeEach(() => {
  // Through the project's own guarded helpers: the test environment's
  // `localStorage` does not implement `clear()`, but every helper degrades
  // safely when a method is missing.
  clearConversations();
  removeKey(THEME_STORAGE_KEY);
  removeKey('chatbot.preferences.v1');
  mockReply();
});

describe('App', () => {
  it('shows the welcome screen when there is no conversation', () => {
    render(<App />);

    expect(
      screen.getByRole('heading', { name: /how can i help you today/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('log')).not.toBeInTheDocument();
  });

  it('starts a conversation from a welcome-screen suggestion', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /weekend trip/i }));

    expect(await screen.findByText('A backend reply')).toBeInTheDocument();
    expect(chatService.streamAssistantReply).toHaveBeenCalledTimes(1);
  });

  it('sends the message and renders the assistant reply', async () => {
    render(<App />);

    await sendMessage('How are you?');

    expect(chatService.streamAssistantReply).toHaveBeenCalledTimes(1);
    const { messages } = vi.mocked(chatService.streamAssistantReply).mock.calls[0][0];
    expect(messages.map((message) => message.message)).toEqual(['How are you?']);

    expect(await screen.findByText('A backend reply')).toBeInTheDocument();
    expect(transcript().getByText('How are you?')).toBeInTheDocument();
  });

  it('clears the composer after sending', async () => {
    render(<App />);

    await sendMessage('How are you?');

    await waitFor(() => {
      expect(composer()).toHaveValue('');
    });
  });

  it('surfaces a backend error instead of inventing a reply', async () => {
    vi.mocked(chatService.streamAssistantReply).mockRejectedValue(
      new Error('Could not reach the server. Check that the backend is running.'),
    );
    render(<App />);

    await sendMessage('How are you?');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not reach the server');

    // The user's message is kept, and no assistant reply is fabricated.
    expect(transcript().getByText('How are you?')).toBeInTheDocument();
    expect(screen.queryByText('A backend reply')).not.toBeInTheDocument();
  });

  it('ignores an empty submission', () => {
    render(<App />);

    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled();

    fireEvent.change(composer(), { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled();
  });

  it('submits on Enter', async () => {
    render(<App />);

    fireEvent.change(composer(), { target: { value: 'Sent with Enter' } });
    fireEvent.keyDown(composer(), { key: 'Enter' });

    expect(await screen.findByText('A backend reply')).toBeInTheDocument();
    expect(chatService.streamAssistantReply).toHaveBeenCalledTimes(1);
  });

  it('inserts a newline on Shift+Enter instead of sending', () => {
    render(<App />);

    const textarea = composer();
    fireEvent.change(textarea, { target: { value: 'line one' } });

    const notPrevented = fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });

    // The handler must not have intercepted the key, or the browser could not
    // insert the newline.
    expect(notPrevented).toBe(true);
    expect(chatService.streamAssistantReply).not.toHaveBeenCalled();
    expect(textarea).toHaveValue('line one');
  });

  it('offers a stop control while a reply is in flight and cancels on click', async () => {
    vi.mocked(chatService.streamAssistantReply).mockImplementation(
      ({ signal }) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => {
            const error = new Error('Request cancelled.');
            error.code = 'CANCELLED';
            reject(error);
          });
        }),
    );
    render(<App />);

    await sendMessage('Long question');

    const stopButton = await screen.findByRole('button', { name: /stop generating/i });
    fireEvent.click(stopButton);

    // The cancellation is not an error: no alert, and the composer recovers.
    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: /stop generating/i }),
      ).not.toBeInTheDocument();
    });
    expect(composer()).toBeEnabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(transcript().getByText('Long question')).toBeInTheDocument();
  });

  it('regenerates the last reply from the last user turn', async () => {
    render(<App />);

    await sendMessage('Hello');
    await screen.findByText('A backend reply');

    mockReply('Second attempt');
    fireEvent.click(screen.getByRole('button', { name: /regenerate/i }));

    expect(await screen.findByText('Second attempt')).toBeInTheDocument();
    expect(screen.queryByText('A backend reply')).not.toBeInTheDocument();

    // Regeneration re-sends history up to the last user message only.
    const { messages } = vi.mocked(chatService.streamAssistantReply).mock.calls.at(-1)[0];
    expect(messages.map((message) => message.message)).toEqual(['Hello']);
  });

  it('renders streamed chunks progressively and finalizes without a duplicate', async () => {
    let finishStream;
    vi.mocked(chatService.streamAssistantReply).mockImplementation(
      ({ onDelta }) =>
        new Promise((resolve) => {
          onDelta('First', {
            id: 'streamed-reply',
            sender: 'robot',
            message: 'First',
            status: 'streaming',
          });
          finishStream = () =>
            resolve({
              id: 'streamed-reply',
              sender: 'robot',
              message: 'First and final',
              status: 'complete',
            });
        }),
    );
    render(<App />);

    await sendMessage('Stream this');
    expect(await screen.findByText('First')).toBeInTheDocument();
    expect(transcript().getAllByText('First')).toHaveLength(1);

    finishStream();
    expect(await screen.findByText('First and final')).toBeInTheDocument();
    expect(transcript().getAllByText('First and final')).toHaveLength(1);
  });
});
