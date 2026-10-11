import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Composer } from './Composer.jsx';

describe('Composer attachments', () => {
  it('reports selected files to the upload handler and clears the picker', () => {
    const onUploadFiles = vi.fn();
    render(<Composer onUploadFiles={onUploadFiles} />);
    const file = new File(['notes'], 'notes.txt', { type: 'text/plain' });
    const input = screen.getByLabelText('Select files to attach');

    fireEvent.change(input, { target: { files: [file] } });

    expect(onUploadFiles).toHaveBeenCalledWith([file]);
    expect(input).toHaveValue('');
  });

  it('renders stored files with accessible download and remove controls', () => {
    const onDownloadUpload = vi.fn();
    const onDeleteUpload = vi.fn();
    const upload = {
      id: 'upload-1',
      name: 'notes.txt',
      contentType: 'text/plain',
      size: 5,
    };
    render(
      <Composer
        uploads={[upload]}
        onDownloadUpload={onDownloadUpload}
        onDeleteUpload={onDeleteUpload}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Download notes.txt' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove notes.txt' }));

    expect(onDownloadUpload).toHaveBeenCalledWith(upload);
    expect(onDeleteUpload).toHaveBeenCalledWith(upload);
  });

  it('explains when document search indexing is pending', () => {
    render(
      <Composer
        uploads={[{
          id: 'upload-2',
          name: 'unindexed.txt',
          contentType: 'text/plain',
          size: 5,
          indexStatus: 'pending',
        }]}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Search setup required');
  });

  it('shows image previews and only accepts formats supported by the selected model', () => {
    render(
      <Composer
        imageMimeTypes={['image/jpeg', 'image/png', 'image/gif']}
        uploads={[{
          id: 'image-1',
          name: 'photo.gif',
          contentType: 'image/gif',
          size: 24,
          previewUrl: 'blob:preview',
        }]}
      />,
    );

    expect(screen.getByAltText('Preview of photo.gif')).toHaveAttribute('src', 'blob:preview');
    expect(screen.getByLabelText('Select files to attach')).toHaveAttribute(
      'accept',
      '.pdf,.docx,.txt,.md,.csv,.jpg,.jpeg,.png,.gif',
    );
  });

  it('keeps voice transcripts editable and does not send them automatically', async () => {
    let recognition;
    class FakeRecognition {
      start = vi.fn();
      stop = vi.fn();
      constructor() {
        recognition = this;
      }
    }
    Object.defineProperty(window, 'SpeechRecognition', {
      configurable: true,
      value: FakeRecognition,
    });
    const onSend = vi.fn();
    render(<Composer onSend={onSend} />);

    fireEvent.click(screen.getByRole('button', { name: 'Start voice input' }));
    recognition.onresult({
      results: [{ isFinal: true, 0: { transcript: 'Describe this image' } }],
    });

    await waitFor(() => expect(screen.getByLabelText('Message')).toHaveValue('Describe this image'));
    expect(onSend).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Edited transcript' } });
    expect(screen.getByLabelText('Message')).toHaveValue('Edited transcript');
  });

  it('disables speech input when the browser API is unavailable', () => {
    Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: undefined });
    Object.defineProperty(window, 'webkitSpeechRecognition', { configurable: true, value: undefined });
    render(<Composer />);

    expect(screen.getByRole('button', { name: 'Start voice input' })).toBeDisabled();
    expect(screen.getByText(/Voice input unavailable/)).toBeInTheDocument();
  });

  it('displays upload progress accessibly', () => {
    render(
      <Composer
        isUploading
        uploadProgress={{ name: 'photo.png', percent: 48 }}
      />,
    );

    expect(screen.getByLabelText('Uploading photo.png')).toHaveValue(48);
    expect(screen.getByText('Uploading photo.png… 48%')).toBeInTheDocument();
  });
});
