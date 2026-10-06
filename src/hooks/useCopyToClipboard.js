import { useCallback, useEffect, useRef, useState } from 'react';
import { toPlainText } from '../utils/text.js';

/**
 * Copy-to-clipboard with a transient "Copied" confirmation.
 *
 * Uses the async Clipboard API when available and falls back to a hidden
 * textarea plus `execCommand`, because the async API is unavailable on
 * insecure origins — which includes a dev server reached over plain http on a
 * LAN address. When both fail, the caller gets `failed` so it can tell the user
 * to copy manually instead of lying about success.
 */

const FEEDBACK_MS = 2000;

function copyWithExecCommand(text) {
  if (typeof document === 'undefined' || typeof document.execCommand !== 'function') {
    return false;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  // Off-screen rather than `display: none`, which would make it unselectable.
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '-1000px';
  textarea.style.opacity = '0';

  document.body.appendChild(textarea);
  textarea.select();

  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}

export function useCopyToClipboard({ feedbackMs = FEEDBACK_MS } = {}) {
  const [state, setState] = useState({ copied: false, failed: false });
  const timeoutRef = useRef(null);

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  const scheduleReset = useCallback(() => {
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setState({ copied: false, failed: false });
    }, feedbackMs);
  }, [feedbackMs]);

  const copy = useCallback(
    async (text) => {
      const value = toPlainText(text);

      let succeeded = false;
      try {
        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(value);
          succeeded = true;
        } else {
          succeeded = copyWithExecCommand(value);
        }
      } catch {
        succeeded = false;
      }

      setState(succeeded ? { copied: true, failed: false } : { copied: false, failed: true });
      scheduleReset();

      return succeeded;
    },
    [scheduleReset],
  );

  return { ...state, copy };
}