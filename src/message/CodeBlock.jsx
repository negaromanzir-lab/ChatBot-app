import { CopyButton } from './CopyButton.jsx';
import './CodeBlock.css';

/**
 * A fenced code block with a language label and a copy control.
 *
 * The label falls back to a neutral "code" rather than hiding, because knowing
 * whether a snippet is JSON or shell is the first thing a reader checks.
 */
export function CodeBlock({ code, language }) {
  return (
    <figure className="code-block">
      <figcaption className="code-block__bar">
        <span className="code-block__language">{language || 'code'}</span>
        <CopyButton value={code} className="code-block__copy" />
      </figcaption>

      <pre className="code-block__pre">
        <code className={`hljs language-${language || 'plaintext'}`}>{code}</code>
      </pre>
    </figure>
  );
}

export default CodeBlock;