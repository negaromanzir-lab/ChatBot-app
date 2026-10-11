import { IconButton } from '../ui/Button.jsx';
import { CopyButton } from './CopyButton.jsx';
import './MessageActions.css';
import { Icon } from '../ui/Icon.jsx';

/**
 * Per-message controls.
 *
 * `Regenerate` is only offered on an assistant reply, since re-asking makes no
 * sense before the assistant has said anything. The controls are always present
 * in the accessibility tree and only fade visually, so keyboard users are not
 * left with controls that appear on hover.
 */
export function MessageActions({
  content,
  onRegenerate,
  canRegenerate = false,
  speech,
  messageId,
  isUser = false,
  onEdit,
  canEdit = false,
}) {
  const isSpeaking = speech?.activeMessageId === messageId;
  return (
    <div className="message-actions">
      <CopyButton value={content} label="Copy message" />

      {isUser && canEdit && (
        <IconButton icon="pencil" label="Edit message" size="sm" onClick={onEdit} />
      )}

      {speech?.available && (
        <button
          type="button"
          className="message-actions__speech"
          aria-label={isSpeaking && !speech.isPaused ? 'Pause response audio' : 'Play response audio'}
          title={isSpeaking && !speech.isPaused ? 'Pause audio' : 'Play audio'}
          onClick={() => speech.toggle(messageId, content)}
        >
          <Icon name={isSpeaking && !speech.isPaused ? 'pause' : 'play'} size={15} />
        </button>
      )}

      {canRegenerate && (
        <IconButton
          icon="regenerate"
          label="Regenerate response"
          size="sm"
          onClick={onRegenerate}
        />
      )}
    </div>
  );
}

export default MessageActions;