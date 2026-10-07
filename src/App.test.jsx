import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from './App';
import * as chatService from './services/chatService.js';
import * as conversationService from './services/conversationService.js';
import * as modelService from './services/modelService.js';
import * as authHook from './hooks/useAuth.js';
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

vi.mock('@clerk/react', () => ({
  UserButton: () => <button type="button" aria-label="User profile and account menu" />,
  SignIn: () => <div data-testid="clerk-sign-in" />,
  SignUp: () => <div data-testid="clerk-sign-up" />,
}));

vi.mock('./hooks/useAuth.js', () => ({
  useAuth: vi.fn(),
}));

vi.mock('./services/conversationService.js', () => ({
  createConversationMessage: vi.fn(async (id, message) => ({
    conversation: { id, title: 'New chat', createdAt: Date.now(), updatedAt: Date.now() },
    message: {
      id: `persisted-${message.sender}-${Date.now()}`,
      sender: message.sender,
      message: message.message,
      createdAt: Date.now(),
    },
  })),
  appendConversationMessage: vi.fn(async (id, message) => ({
    conversation: { id, title: 'New chat', createdAt: Date.now(), updatedAt: Date.now() },
    message: {
      id: `persisted-${message.sender}-${Date.now()}`,
      sender: message.sender,
      message: message.message,
      createdAt: Date.now(),
    },
  })),
  createConversation: vi.fn(async () => ({
    id: 'test-conversation',
    title: 'New chat',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: [],
  })),
  deleteConversation: vi.fn(),
  getConversation: vi.fn(),
  importLocalHistory: vi.fn().mockResolvedValue(null),
  listConversations: vi.fn().mockResolvedValue([]),
  listConversationUploads: vi.fn().mockResolvedValue([]),
  uploadConversationFile: vi.fn(async (_id, file) => ({
    id: 'uploaded-file-id',
    name: file.name,
    contentType: file.type,
    size: file.size,
  })),
  downloadConversationFile: vi.fn(),
  deleteConversationFile: vi.fn(),
  renameConversation: vi.fn(),
}));

vi.mock('./services/modelService.js', () => ({
  listAvailableModels: vi.fn().mockResolvedValue({
    defaultModelId: 'local-offline',
    models: [
      { id: 'local-offline', label: 'Local offline', provider: 'local', supportsVision: false },
      { id: 'openai-default', label: 'GPT (OpenAI)', provider: 'openai', supportsVision: true },
    ],
  }),
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
  fireEvent.change(await screen.findByLabelText('Message'), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: /send/i }));
}

beforeEach(() => {
  // Through the project's own guarded helpers: the test environment's
  // `localStorage` does not implement `clear()`, but every helper degrades
  // safely when a method is missing.
  clearConversations();
  removeKey(THEME_STORAGE_KEY);
  removeKey('chatbot.preferences.v1');
  vi.mocked(authHook.useAuth).mockReturnValue({
    user: { id: 'test-user', email: 'test@example.com', fullName: 'Test User' },
    isLoading: false,
  });
  vi.mocked(conversationService.importLocalHistory).mockResolvedValue(null);
  vi.mocked(conversationService.listConversations).mockResolvedValue([]);
  vi.mocked(conversationService.listConversationUploads).mockResolvedValue([]);
  vi.mocked(modelService.listAvailableModels).mockResolvedValue({
    defaultModelId: 'local-offline',
    models: [
      { id: 'local-offline', label: 'Local offline', provider: 'local', supportsVision: false },
      { id: 'openai-default', label: 'GPT (OpenAI)', provider: 'openai', supportsVision: true },
    ],
  });
  vi.mocked(conversationService.uploadConversationFile).mockImplementation(
    async (_id, file) => ({
      id: 'uploaded-file-id',
      name: file.name,
      contentType: file.type,
      size: file.size,
    }),
  );
  vi.mocked(conversationService.createConversation).mockResolvedValue({
    id: 'test-conversation',
    title: 'New chat',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: [],
  });
  vi.mocked(conversationService.createConversationMessage).mockImplementation(
    async (id, message) => ({
      conversation: { id, title: 'New chat', createdAt: Date.now(), updatedAt: Date.now() },
      message: {
        id: `persisted-${message.sender}-${Date.now()}`,
        sender: message.sender,
        message: message.message,
        createdAt: Date.now(),
      },
    }),
  );
  mockReply();
});

describe('App', () => {
  it('uses Clerk sign-in and sign-up components for unauthenticated users', async () => {
    vi.mocked(authHook.useAuth).mockReturnValue({
      user: null,
      isLoading: false,
    });
    render(<App />);

    expect(screen.getByTestId('clerk-sign-in')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByTestId('clerk-sign-up')).toBeInTheDocument();
  });

  it('shows the welcome screen when there is no conversation', async () => {
    render(<App />);

    expect(
      await screen.findByRole('heading', { name: /how can i help you today/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('log')).not.toBeInTheDocument();
  });

  it('starts a conversation from a welcome-screen suggestion', async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: /weekend trip/i }));

    expect(await screen.findByText('A backend reply')).toBeInTheDocument();
    expect(chatService.streamAssistantReply).toHaveBeenCalledTimes(1);
  });

  it('sends the message and renders the assistant reply', async () => {
    render(<App />);

    await sendMessage('How are you?');
    expect(await screen.findByText('A backend reply')).toBeInTheDocument();

    expect(chatService.streamAssistantReply).toHaveBeenCalledTimes(1);
    const { messages } = vi.mocked(chatService.streamAssistantReply).mock.calls[0][0];
    expect(messages.map((message) => message.message)).toEqual(['How are you?']);

    expect(transcript().getByText('How are you?')).toBeInTheDocument();
  });

  it('sends the selected safe model identifier with the chat request', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
    fireEvent.change(await screen.findByLabelText('Choose a model'), {
      target: { value: 'openai-default' },
    });
    await sendMessage('Use GPT');

    await waitFor(() => {
      expect(chatService.streamAssistantReply).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'openai-default' }),
      );
    });
    expect(chatService.streamAssistantReply.mock.calls[0][0].model).toBe('openai-default');
  });

  it('persists the user message before requesting an assistant reply', async () => {
    render(<App />);

    await sendMessage('Save this exchange');
    expect(await screen.findByText('A backend reply')).toBeInTheDocument();

    expect(conversationService.createConversationMessage).toHaveBeenCalledTimes(1);
    expect(conversationService.createConversationMessage).toHaveBeenCalledWith(
      'test-conversation',
      expect.objectContaining({ sender: 'user', message: 'Save this exchange' }),
    );
    expect(transcript().getAllByText('A backend reply')).toHaveLength(1);
  });

  it('creates a conversation and uploads a file from the composer', async () => {
    render(<App />);
    await screen.findByLabelText('Message');

    const file = new File(['notes'], 'notes.txt', { type: 'text/plain' });
    fireEvent.change(screen.getByLabelText('Select files to attach'), {
      target: { files: [file] },
    });

    await waitFor(() => {
      expect(conversationService.uploadConversationFile).toHaveBeenCalledWith(
        'test-conversation',
        file,
      );
    });
    expect(await screen.findByRole('button', { name: 'Download notes.txt' }))
      .toBeInTheDocument();
    expect(conversationService.createConversation).toHaveBeenCalledOnce();

    await sendMessage('What is in these notes?');
    await waitFor(() => {
      expect(chatService.streamAssistantReply).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: 'test-conversation',
          fileIds: ['uploaded-file-id'],
        }),
      );
    });
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

  it('ignores an empty submission', async () => {
    render(<App />);

    expect(await screen.findByRole('button', { name: /send/i })).toBeDisabled();

    fireEvent.change(await screen.findByLabelText('Message'), {
      target: { value: '   ' },
    });
    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled();
  });

  it('submits on Enter', async () => {
    render(<App />);

    fireEvent.change(await screen.findByLabelText('Message'), {
      target: { value: 'Sent with Enter' },
    });
    fireEvent.keyDown(composer(), { key: 'Enter' });

    expect(await screen.findByText('A backend reply')).toBeInTheDocument();
    expect(chatService.streamAssistantReply).toHaveBeenCalledTimes(1);
  });

  it('inserts a newline on Shift+Enter instead of sending', async () => {
    render(<App />);

    const textarea = await screen.findByLabelText('Message');
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
    expect(await screen.findByLabelText('Message')).toBeEnabled();
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
