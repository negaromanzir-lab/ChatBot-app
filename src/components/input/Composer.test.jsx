import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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
});
