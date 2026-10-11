import { useState } from 'react';
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
export function MessageBubble({
  message,
  onRegenerate,
  canRegenerate = false,
  showActions = true,
  speech,
  onEditMessage,
  canEdit = false,
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(message.message);
  const { sender, message: content, createdAt } = message;
  const isUser = sender === 'user';
  const hasWebSources = !isUser && content.includes('**Web search sources**');
  const hasDocumentSources = !isUser && content.includes('**Uploaded document sources**');
  const sourceLabel = hasWebSources && hasDocumentSources
    ? 'Web search and uploaded documents'
    : hasWebSources
      ? 'Web search'
      : hasDocumentSources
        ? 'Uploaded documents'
        : 'AI knowledge';

  const timestamp = formatTime(createdAt);

  return (
    <article
      className={`message-bubble message-bubble--${isUser ? 'user' : 'assistant'}`}
      aria-label={isUser ? 'Your message' : 'Assistant message'}
    >
      {!isUser && <Avatar sender={sender} />}

      <div className="message-bubble__content">
        {!isUser && (
          <p className="message-bubble__source-label" aria-label="Answer source type">
            {sourceLabel}
          </p>
        )}
        <div className="message-bubble__body">
          {isUser && isEditing ? (
            <form
              className="message-bubble__edit"
              onSubmit={(event) => {
                event.preventDefault();
                onEditMessage?.(message.id, editDraft);
                setIsEditing(false);
              }}
            >
              <label className="visually-hidden" htmlFor={`edit-${message.id}`}>Edit your message</label>
              <textarea
                id={`edit-${message.id}`}
                value={editDraft}
                autoFocus
                onChange={(event) => setEditDraft(event.target.value)}
              />
              <div className="message-bubble__edit-actions">
                <button type="button" onClick={() => {
                  setEditDraft(content);
                  setIsEditing(false);
                }}>Cancel</button>
                <button type="submit" disabled={!editDraft.trim()}>Save and resend</button>
              </div>
            </form>
          ) : isUser ? (
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
            speech={speech}
            messageId={message.id}
            isUser={isUser}
            canEdit={canEdit}
            onEdit={() => {
              setEditDraft(content);
              setIsEditing(true);
            }}
          />
        )}
      </div>

      {isUser && <Avatar sender={sender} />}
    </article>
  );
}

export default MessageBubble;