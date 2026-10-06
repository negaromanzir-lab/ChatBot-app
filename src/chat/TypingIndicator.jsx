import { Avatar } from '../message/Avatar.jsx';
import './TypingIndicator.css';

/**
 * Placeholder shown while a reply is in flight.
 *
 * Communicates "working" without claiming content. Three staggered dots are
 * used rather than a progress bar because the wait is indeterminate — a bar
 * would imply a percentage the client genuinely does not know.
 *
 * The dots are hidden from assistive technology; the pending state is already
 * announced through the composer's stop button.
 */
export function TypingIndicator() {
  return (
    <div className="typing-indicator" role="status">
      <Avatar sender="robot" />
      <span className="typing-indicator__dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span className="visually-hidden">Assistant is replying…</span>
    </div>
  );
}

export default TypingIndicator;