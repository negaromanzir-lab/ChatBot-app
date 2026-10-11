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
  uploadProgress = null,
  onUploadFiles,
  onDownloadUpload,
  onDeleteUpload,
  uploadError = null,
  onDismissUploadError,
  supportsVision,
  imageMimeTypes = [],
}) {
  const [draft, setDraft] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [voiceError, setVoiceError] = useState(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const recognitionRef = useRef(null);
  const SpeechRecognition = typeof window !== 'undefined'
    ? window.SpeechRecognition ?? window.webkitSpeechRecognition
    : null;

  useEffect(() => () => {
    recognitionRef.current?.stop();
  }, []);

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

  function toggleVoiceInput() {
    if (!SpeechRecognition) return;
    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }

    setVoiceError(null);
    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.lang = navigator.language || 'en-US';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .filter((result) => result.isFinal)
        .map((result) => result[0]?.transcript ?? '')
        .join(' ')
        .trim();
      if (transcript) {
        setDraft((current) => [current.trim(), transcript].filter(Boolean).join(' '));
      }
    };
    recognition.onerror = (event) => {
      setVoiceError(event.error === 'not-allowed'
        ? 'Microphone access was denied. You can still type your message.'
        : 'Voice input failed. You can still type your message.');
    };
    recognition.onend = () => setIsListening(false);
    try {
      recognition.start();
      setIsListening(true);
    } catch {
      setIsListening(false);
      setVoiceError('Voice input could not start. You can still type your message.');
    }
  }

  const imageExtensions = imageMimeTypes.flatMap((type) => ({
    'image/jpeg': ['.jpg', '.jpeg'],
    'image/png': ['.png'],
    'image/webp': ['.webp'],
    'image/gif': ['.gif'],
  }[type] ?? []));
  const acceptedTypes = [
    '.pdf', '.docx', '.txt', '.md', '.csv',
    ...imageExtensions,
  ].join(',');

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

      {voiceError && (
        <div className="composer__notice composer__notice--error" role="alert">
          <span className="composer__notice-text">{voiceError}</span>
          <IconButton
            icon="close"
            label="Dismiss voice input message"
            size="sm"
            onClick={() => setVoiceError(null)}
          />
        </div>
      )}
      {isListening && <p className="composer__voice-status" role="status">Listening… Your transcript will appear here for editing.</p>}

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
                {upload.contentType?.startsWith('image/') && upload.previewUrl ? (
                  <img
                    className="composer__image-preview"
                    src={upload.previewUrl}
                    alt={`Preview of ${upload.name}`}
                  />
                ) : (
                  <Icon name="attach" size={14} />
                )}
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
          accept={acceptedTypes}
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
        <button
          type="button"
          className={`composer__attach${isListening ? ' composer__attach--active' : ''}`}
          aria-label={isListening ? 'Stop voice input' : 'Start voice input'}
          title={SpeechRecognition ? 'Dictate a message' : 'Voice input is unavailable in this browser'}
          disabled={isPending || !SpeechRecognition}
          onClick={toggleVoiceInput}
        >
          <Icon name="microphone" size={18} />
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
        {isUploading
          ? `Uploading ${uploadProgress?.name ?? 'file'}… ${uploadProgress?.percent ?? 0}%`
          : !SpeechRecognition
            ? 'Voice input unavailable in this browser · Type or attach a file'
            : 'Attach files or dictate a message · Review and edit the transcript before sending · Enter to send'}
      </p>
      {isUploading && (
        <progress
          className="composer__upload-progress"
          aria-label={`Uploading ${uploadProgress?.name ?? 'file'}`}
          max="100"
          value={uploadProgress?.percent ?? 0}
        />
      )}
    </div>
  );
}

export default Composer;
