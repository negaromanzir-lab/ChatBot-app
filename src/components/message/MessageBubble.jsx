import { Avatar } from './Avatar.jsx';
import { MarkdownContent } from './MarkdownContent.jsx';
import { MessageActions } from './MessageActions.jsx';
import { formatAbsoluteDate, formatTime } from '../../utils/date.js';
import './MessageBubble.css';

/**
 * One turn in the transcript.
 *
 * The two senders are deliberately not styled as mirror images: the user's own
 * words appear as a right-aligned bubble, while assistant replies are
 * full-width prose beside an avatar. That asymmetry is what makes a long answer
 * readable — wrapping Markdown in a narrow bubble would reintroduce the cramped
 * column this layout exists to remove.
 *
 * User text renders as plain text with preserved whitespace. Only the assistant
 * side is treated as Markdown, so a message containing `<b>` or `#` from the
 * user is shown as the literal characters they typed.
 */
export function MessageBubble({ message, onRegenerate, canRegenerate = false, showActions = true }) {
  const { sender, message: content, createdAt } = message;
  const isUser = sender === 'user';

  const timestamp = formatTime(createdAt);

  return (
    <article
      className={`message-bubble message-bubble--${isUser ? 'user' : 'assistant'}`}
      aria-label={isUser ? 'Your message' : 'Assistant message'}
    >
      {!isUser && <Avatar sender={sender} />}

      <div className="message-bubble__content">
        <div className="message-bubble__body">
          {isUser ? (
            <p className="message-bubble__text">{content}</p>
          ) : (
            <MarkdownContent content={content} />
          )}
        </div>

        {timestamp && (
          <time
            className="message-bubble__timestamp"
            dateTime={new Date(createdAt).toISOString()}
            title={formatAbsoluteDate(createdAt)}
          >
            {timestamp}
          </time>
        )}

        {showActions && (
          <MessageActions
            content={content}
            onRegenerate={onRegenerate}
            canRegenerate={canRegenerate}
          />
        )}
      </div>

      {isUser && <Avatar sender={sender} />}
    </article>
  );
}

export default MessageBubble;