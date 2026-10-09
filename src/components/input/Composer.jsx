import { useEffect, useRef, useState } from 'react';
import { Icon } from '../ui/Icon.jsx';
import { IconButton } from '../ui/Button.jsx';
import './Composer.css';

/** Cap on the auto-grown textarea; beyond this it scrolls instead. */
const MAX_HEIGHT_PX = 200;

/**
 * Message composer.
 *
 * Keyboard contract, which is the part worth stating explicitly:
 *
 * - Enter sends, but only when no IME composition is in progress, otherwise
 *   typing Japanese/Chinese would send mid-word.
 * - Shift+Enter inserts a newline and is never intercepted.
 * - Both the Enter path and the send button funnel through the same submit
 *   function, so there is one place that validates and clears the draft.
 *
 * While a reply is in flight the send button is replaced by a stop control, so
 * "how do I cancel" never requires hunting for a button that is merely disabled.
 * A stopped reply is reported through a status notice with a retry, rather than
 * silently dropping the turn.
 */
export function Composer({
  onSend,
  onStop,
  onRetry,
  isPending = false,
  error = null,
  onDismissError,
  wasStopped = false,
  onDismissStopped,
  uploads = [],
  isUploading = false,
  onUploadFiles,
  onDownloadUpload,
  onDeleteUpload,
  uploadError = null,
  onDismissUploadError,
  supportsVision,
}) {
  const [draft, setDraft] = useState('');
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

  const isDraftEmpty = draft.trim().length === 0;

  // Auto-grow: reset to auto, then clamp to the max so the element never
  // exceeds it while still shrinking back after deleting lines.
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_HEIGHT_PX)}px`;
  }, [draft]);

  function submit() {
    if (isDraftEmpty || isPending) return;

    onSend(draft);
    setDraft('');
  }

  function handleChange(event) {
    setDraft(event.target.value);

    // A stale failure banner should not outlive the start of a new attempt.
    if (error && onDismissError) {
      onDismissError();
    }
  }

  function handleKeyDown(event) {
    if (event.key !== 'Enter' || event.shiftKey) return;
    if (event.nativeEvent?.isComposing) return;

    event.preventDefault();
    submit();
  }

  function handleSubmit(event) {
    event.preventDefault();
    submit();
  }

  return (
    <div className="composer">
      {error && (
        <div className="composer__notice composer__notice--error" role="alert">
          <span className="composer__notice-text">{error}</span>
          <IconButton
            icon="close"
            label="Dismiss error"
            size="sm"
            onClick={() => onDismissError?.()}
          />
        </div>
      )}

      {uploadError && (
        <div className="composer__notice composer__notice--error" role="alert">
          <span className="composer__notice-text">{uploadError}</span>
          <IconButton
            icon="close"
            label="Dismiss upload error"
            size="sm"
            onClick={() => onDismissUploadError?.()}
          />
        </div>
      )}

      {wasStopped && !isPending && (
        <div className="composer__notice" role="status">
          <span className="composer__notice-text">Generation stopped.</span>
          {onRetry && (
            <button type="button" className="composer__retry" onClick={onRetry}>
              Retry
            </button>
          )}
          <IconButton
            icon="close"
            label="Dismiss notice"
            size="sm"
            onClick={() => onDismissStopped?.()}
          />
        </div>
      )}

      {uploads.length > 0 && (
        <ul className="composer__uploads" aria-label="Conversation files">
          {uploads.map((upload) => (
            <li className="composer__upload" key={upload.id}>
              <button
                type="button"
                className="composer__upload-name"
                onClick={() => onDownloadUpload?.(upload)}
                aria-label={`Download ${upload.name}`}
                title={`Download ${upload.name}`}
              >
                <Icon name="attach" size={14} />
                <span>{upload.name}</span>
              </button>
              {upload.indexStatus === 'pending' && (
                <span className="composer__upload-status" role="status">
                  Search setup required
                </span>
              )}
              {upload.indexStatus === 'failed' && (
                <span className="composer__upload-status" role="status">
                  Search indexing failed
                </span>
              )}
              <IconButton
                icon="close"
                label={`Remove ${upload.name}`}
                size="sm"
                onClick={() => onDeleteUpload?.(upload)}
                disabled={isUploading || isPending}
              />
            </li>
          ))}
        </ul>
      )}

      {supportsVision === false && uploads.some((upload) => upload.contentType?.startsWith('image/')) && (
        <p className="composer__hint" role="status">
          The selected model cannot analyze attached images. Choose a vision-capable model in Settings.
        </p>
      )}

      <form className="composer__form" onSubmit={handleSubmit}>
        <input
          ref={fileInputRef}
          id="chat-file-upload"
          className="visually-hidden"
          type="file"
          accept=".pdf,.docx,.txt,.md,.csv,.png,.jpg,.jpeg,.webp"
          multiple
          onChange={(event) => {
            const selectedFiles = Array.from(event.target.files ?? []);
            if (selectedFiles.length) onUploadFiles?.(selectedFiles);
            event.target.value = '';
          }}
        />
        <label className="visually-hidden" htmlFor="chat-file-upload">
          Select files to attach
        </label>
        <button
          type="button"
          className="composer__attach"
          aria-label="Attach files"
          title="Attach files"
          disabled={isPending || isUploading}
          onClick={() => fileInputRef.current?.click()}
        >
          <Icon name="attach" size={18} />
        </button>
        <label className="visually-hidden" htmlFor="chat-composer">
          Message
        </label>
        <textarea
          id="chat-composer"
          ref={textareaRef}
          className="composer__input"
          rows={1}
          placeholder="Send a message to Chatbot"
          autoComplete="off"
          value={draft}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={isPending}
        />

        {isPending ? (
          <button
            type="button"
            className="composer__submit composer__submit--stop"
            aria-label="Stop generating"
            title="Stop generating"
            onClick={onStop}
          >
            <Icon name="stop" size={16} />
          </button>
        ) : (
          <button
            type="submit"
            className="composer__submit"
            aria-label="Send message"
            title="Send message"
            disabled={isDraftEmpty}
          >
            <Icon name="send" size={16} />
          </button>
        )}
      </form>

      <p className="composer__hint">
        {isUploading ? 'Uploading files…' : 'Attach PDF, DOCX, text, Markdown, CSV, PNG, JPEG, or WebP · Enter to send'}
      </p>
    </div>
  );
}

export default Composer;
