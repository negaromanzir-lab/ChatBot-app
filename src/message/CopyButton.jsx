import { useCopyToClipboard } from '../hooks/useCopyToClipboard.js';
import { Icon } from '../components/Icon.jsx';
import './CopyButton.css';

/**
 * Copy-to-clipboard control with inline confirmation.
 *
 * Shared by message actions and code blocks, because the confirmation behaviour
 * and the failure fallback should not differ between the two.
 *
 * When the clipboard is genuinely unreachable the label says so instead of
 * claiming success, and points at the manual alternative.
 */
export function CopyButton({
  value,
  label = 'Copy',
  iconSize = 14,
  className,
  children,
}) {
  const { copied, failed, copy } = useCopyToClipboard();

  return (
    <button
      type="button"
      className={['copy-button', className].filter(Boolean).join(' ')}
      onClick={() => copy(value)}
      aria-label={copied ? `${label}ed` : label}
    >
      <Icon name={copied ? 'check' : 'copy'} size={iconSize} />
      <span aria-hidden="true">
        {children ?? (copied ? 'Copied' : failed ? 'Copy unavailable' : label)}
      </span>
    </button>
  );
}

export default CopyButton;