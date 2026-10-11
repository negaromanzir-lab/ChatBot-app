import { useAutoScroll } from '../../hooks/useAutoScroll.js';
import { MessageBubble } from '../message/MessageBubble.jsx';
import { TypingIndicator } from './TypingIndicator.jsx';
import { Icon } from '../ui/Icon.jsx';
import { useSpeechSynthesis } from '../../hooks/useSpeechSynthesis.js';
import './MessageList.css';

/**
 * Scrollable transcript.
 *
 * Auto-scroll is delegated to `useAutoScroll`, which only pins to the bottom
 * while the reader is already there. Once they scroll up to re-read something,
 * a "jump to latest" button appears instead of yanking them back down on the
 * next token.
 */
export function MessageList({
  messages,
  isPending,
  toolStatus,
  onRegenerate,
  onEditMessage,
}) {
  const speech = useSpeechSynthesis();
  const { containerRef, isAtBottom, handleScroll, scrollToLatest } = useAutoScroll(
    `${messages.length}:${messages.at(-1)?.message?.length ?? 0}:${isPending}`,
  );

  const lastMessage = messages[messages.length - 1];
  const lastUserMessage = [...messages].reverse().find(({ sender }) => sender === 'user');
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
        aria-live="off"
        aria-label="Conversation"
      >
        <div className="message-list__inner">
          {messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              onRegenerate={onRegenerate}
              onEditMessage={onEditMessage}
              canEdit={message.id === lastUserMessage?.id && !isPending}
              canRegenerate={canRegenerateLast && message.id === lastMessage.id}
              showActions={!isPending}
              speech={speech}
            />
          ))}

          {isPending && <TypingIndicator toolStatus={toolStatus} />}
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