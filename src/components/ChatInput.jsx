import { useState } from 'react';
import './ChatInput.css';

/**
 * Composer. Purely presentational: it holds only the draft text and reports the
 * user's intent through `onSend`. It performs no AI call and holds no
 * conversation state.
 *
 * The markup is a real `<form>` with a labelled input and `type="submit"`, so
 * Enter sends, and screen readers get an accessible name. The send button is
 * disabled while a reply is in flight and while the draft is empty, which is
 * what prevents duplicate submissions at the source rather than by convention.
 */
export function ChatInput({ onSend, isPending, error, onDismissError }) {
  const [draft, setDraft] = useState('');

  const isDraftEmpty = draft.trim().length === 0;
  const isSendDisabled = isDraftEmpty || isPending;

  function handleChange(event) {
    setDraft(event.target.value);

    // Clear a stale error as soon as the user starts a new attempt, so the
    // failure banner does not linger over a fresh message.
    if (error && onDismissError) {
      onDismissError();
    }
  }

  function handleSubmit(event) {
    // Without this the browser would navigate, losing the SPA state.
    event.preventDefault();

    if (isSendDisabled) {
      return;
    }

    onSend(draft);
    setDraft('');
  }

  return (
    <div className="chat-input-container">
      {error && (
        <p className="chat-error" role="alert">
          {error}
        </p>
      )}

      <form className="chat-form" onSubmit={handleSubmit}>
        <label className="visually-hidden" htmlFor="chat-input">
          Message
        </label>
        <input
          id="chat-input"
          name="message"
          className="chat-input"
          placeholder="Send a message to Chatbot"
          autoComplete="off"
          value={draft}
          onChange={handleChange}
          disabled={isPending}
        />
        <button type="submit" className="send-button" disabled={isSendDisabled}>
          {isPending ? 'Sending...' : 'Send'}
        </button>
      </form>
    </div>
  );
}

export default ChatInput;