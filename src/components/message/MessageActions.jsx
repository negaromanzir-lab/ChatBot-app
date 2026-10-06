import { IconButton } from '../ui/Button.jsx';
import { CopyButton } from './CopyButton.jsx';
import './MessageActions.css';

/**
 * Per-message controls.
 *
 * `Regenerate` is only offered on an assistant reply, since re-asking makes no
 * sense before the assistant has said anything. The controls are always present
 * in the accessibility tree and only fade visually, so keyboard users are not
 * left with controls that appear on hover.
 */
export function MessageActions({ content, onRegenerate, canRegenerate = false }) {
  return (
    <div className="message-actions">
      <CopyButton value={content} label="Copy message" />

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