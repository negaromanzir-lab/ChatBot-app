import { Icon } from '../ui/Icon.jsx';
import './WelcomeScreen.css';

/**
 * Starter prompts, not canned answers. Clicking one puts the text in the
 * composer via the normal send path, so it behaves exactly as if the user had
 * typed it — nothing here fabricates a reply.
 */
const SUGGESTIONS = [
  'Explain async/await in JavaScript',
  'Write a Python function to sort a list',
  'Give me ideas for a weekend trip',
  'Summarise the rules of chess',
];

/**
 * Empty state shown when the active conversation has no messages.
 *
 * Replaces the "blank screen with a cursor" problem: it states what the app
 * does and offers a one-click way to start, which is the same shape users
 * already know from the mainstream assistants.
 */
export function WelcomeScreen({ onSuggest }) {
  return (
    <div className="welcome">
      <span className="welcome__badge" aria-hidden="true">
        <Icon name="assistant" size={30} />
      </span>

      <h1 className="welcome__title">How can I help you today?</h1>
      <p className="welcome__subtitle">
        Ask anything. Replies are rendered as Markdown, with copyable code blocks.
      </p>

      <div className="welcome__suggestions">
        {SUGGESTIONS.map((suggestion) => (
          <button
            type="button"
            key={suggestion}
            className="welcome__suggestion"
            onClick={() => onSuggest(suggestion)}
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}

export default WelcomeScreen;
