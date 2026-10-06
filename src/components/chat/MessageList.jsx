import { useAutoScroll } from '../../hooks/useAutoScroll.js';
import { MessageBubble } from '../message/MessageBubble.jsx';
import { TypingIndicator } from './TypingIndicator.jsx';
import { Icon } from '../ui/Icon.jsx';
import './MessageList.css';

/**
 * Scrollable transcript.
 *
 * Auto-scroll is delegated to `useAutoScroll`, which only pins to the bottom
 * while the reader is already there. Once they scroll up to re-read something,
 * a "jump to latest" button appears instead of yanking them back down on the
 * next token.
 */
export function MessageList({ messages, isPending, onRegenerate }) {
  const { containerRef, isAtBottom, handleScroll, scrollToLatest } = useAutoScroll(
    // Length is the right key: streaming text changes content without changing
    // length, and non-streaming replies are atomic anyway.
    `${messages.length}:${isPending}`,
  );

  const lastMessage = messages[messages.length - 1];
  // Regenerate replaces the final assistant reply, so it only makes sense there.
  const canRegenerateLast = lastMessage?.sender === 'robot' && !isPending;

  return (
    <div className="message-list">
      <div
        className="message-list__scroll"
        ref={containerRef}
        onScroll={handleScroll}
        tabIndex={0}
        role="log"
        aria-live="polite"
        aria-label="Conversation"
      >
        <div className="message-list__inner">
          {messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              onRegenerate={onRegenerate}
              canRegenerate={canRegenerateLast && message.id === lastMessage.id}
              showActions={!isPending}
            />
          ))}

          {isPending && <TypingIndicator />}
        </div>
      </div>

      {!isAtBottom && (
        <button
          type="button"
          className="message-list__jump"
          onClick={scrollToLatest}
          title="Jump to latest message"
        >
          <Icon name="chevronDown" size={20} />
          <span className="visually-hidden">Jump to latest message</span>
        </button>
      )}
    </div>
  );
}

export default MessageList;