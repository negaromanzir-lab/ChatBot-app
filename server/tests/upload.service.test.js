import { describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import { createUploadService, sanitizeUploadName } from '../src/modules/uploads/upload.service.js';

function createPdf(text) {
  const stream = `BT /F1 18 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf);
}

function createFixtures() {
  const repository = {
    ownsConversation: vi.fn().mockResolvedValue(true),
    create: vi.fn(async (_userId, conversationId, upload) => ({
      id: 'upload-record-id',
      conversationId,
      name: upload.name,
      contentType: upload.contentType,
      size: upload.size,
    })),
    list: vi.fn().mockResolvedValue([]),
    find: vi.fn(),
    findForChat: vi.fn(),
    delete: vi.fn(),
  };
  const storage = {
    write: vi.fn(),
    read: vi.fn(),
    delete: vi.fn(),
  };
  return { repository, storage };
}

describe('file upload service', () => {
  it('sanitizes path components from client filenames', () => {
    expect(sanitizeUploadName('C:\\private\\notes.txt')).toBe('notes.txt');
  });

  it('stores approved, signature-checked files under a generated key', async () => {
    const { repository, storage } = createFixtures();
    const service = createUploadService({
      repository,
      storage,
      maxSizeBytes: 1024,
    });
    const contents = createPdf('safe PDF text');

    await expect(
      service.upload('owner-id', 'conversation-id', {
        originalname: '../../report.pdf',
        mimetype: 'application/pdf',
        size: contents.length,
        buffer: contents,
      }),
    ).resolves.toMatchObject({
      id: 'upload-record-id',
      name: 'report.pdf',
      contentType: 'application/pdf',
    });

    const [storageKey, storedContents] = storage.write.mock.calls[0];
    expect(storageKey).toMatch(/^[0-9a-f-]{36}$/i);
    expect(storageKey).not.toContain('report');
    expect(storedContents).toEqual(contents);
    expect(repository.create).toHaveBeenCalledWith('owner-id', 'conversation-id', {
      id: storageKey,
      name: 'report.pdf',
      contentType: 'application/pdf',
      size: contents.length,
      extractedText: expect.stringContaining('safe PDF text'),
    });
  });

  it('indexes extracted text after persisting the private upload', async () => {
    const { repository, storage } = createFixtures();
    const documentIndexer = {
      indexDocument: vi.fn().mockResolvedValue({ status: 'ready' }),
    };
    const service = createUploadService({
      repository,
      storage,
      documentIndexer,
    });
    const text = Buffer.from('Evidence for the semantic index.');

    await expect(service.upload('owner-id', 'conversation-id', {
      originalname: 'evidence.txt',
      mimetype: 'text/plain',
      size: text.length,
      buffer: text,
    })).resolves.toMatchObject({ indexStatus: 'ready' });

    expect(documentIndexer.indexDocument).toHaveBeenCalledWith({
      userId: 'owner-id',
      conversationId: 'conversation-id',
      uploadId: 'upload-record-id',
      text: 'Evidence for the semantic index.',
    });
  });

  it('removes the upload row and private bytes when document indexing fails', async () => {
    const { repository, storage } = createFixtures();
    const documentIndexer = {
      indexDocument: vi.fn().mockRejectedValue(new Error('embedding request failed')),
    };
    const service = createUploadService({ repository, storage, documentIndexer });
    const text = Buffer.from('Text that could not be indexed.');

    await expect(service.upload('owner-id', 'conversation-id', {
      originalname: 'unindexed.txt',
      mimetype: 'text/plain',
      size: text.length,
      buffer: text,
    })).rejects.toThrow('embedding request failed');

    const [storageKey] = storage.write.mock.calls[0];
    expect(repository.delete).toHaveBeenCalledWith(
      'owner-id',
      'conversation-id',
      storageKey,
    );
    expect(storage.delete).toHaveBeenCalledWith(storageKey);
  });

  it('extracts text from TXT and DOCX documents without executing them', async () => {
    const { repository, storage } = createFixtures();
    const service = createUploadService({ repository, storage });
    const plainText = Buffer.from('Readable text from a document.');
    await service.upload('owner-id', 'conversation-id', {
      originalname: 'notes.txt',
      mimetype: 'text/plain',
      size: plainText.length,
      buffer: plainText,
    });
    expect(repository.create.mock.calls[0][2].extractedText)
      .toBe('Readable text from a document.');

    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>DOCX extracted content</w:t></w:r></w:p></w:body></w:document>',
    );
    const docx = await zip.generateAsync({ type: 'nodebuffer' });
    await service.upload('owner-id', 'conversation-id', {
      originalname: 'report.docx',
      mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      size: docx.length,
      buffer: docx,
    });
    expect(repository.create.mock.calls[1][2].extractedText)
      .toContain('DOCX extracted content');
  });

  it('loads image attachments only after ownership-scoped lookup', async () => {
    const { repository, storage } = createFixtures();
    repository.findForChat.mockResolvedValue([{
      id: 'owned-file',
      name: 'photo.png',
      contentType: 'image/png',
      extractedText: null,
      storageKey: 'private-storage-key',
    }]);
    storage.read.mockResolvedValue(Buffer.from('image-bytes'));
    const service = createUploadService({ repository, storage });

    await expect(service.getForChat(
      'user-1',
      'conversation-1',
      ['owned-file'],
      { supportsVision: true },
    ))
      .resolves.toEqual([expect.objectContaining({
        id: 'owned-file',
        contents: Buffer.from('image-bytes'),
      })]);
    expect(repository.findForChat).toHaveBeenCalledWith(
      'user-1',
      'conversation-1',
      ['owned-file'],
    );
    expect(storage.read).toHaveBeenCalledWith('private-storage-key');

    storage.read.mockClear();
    await expect(service.getForChat(
      'user-1',
      'conversation-1',
      ['owned-file'],
      { supportsVision: false },
    )).rejects.toMatchObject({ code: 'AI_MODEL_DOES_NOT_SUPPORT_IMAGES' });
    expect(storage.read).not.toHaveBeenCalled();
  });

  it('rejects disallowed types and mismatched file signatures before storage', async () => {
    const { repository, storage } = createFixtures();
    const service = createUploadService({ repository, storage });

    await expect(
      service.upload('owner-id', 'conversation-id', {
        originalname: 'script.html',
        mimetype: 'text/html',
        size: 8,
        buffer: Buffer.from('<script>'),
      }),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_FILE_TYPE', statusCode: 400 });

    await expect(
      service.upload('owner-id', 'conversation-id', {
        originalname: 'fake.pdf',
        mimetype: 'application/pdf',
        size: Buffer.byteLength('not a pdf'),
        buffer: Buffer.from('not a pdf'),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_FILE_CONTENT', statusCode: 400 });

    expect(storage.write).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('rejects empty, oversized, and invalid UTF-8 files', async () => {
    const { repository, storage } = createFixtures();
    const service = createUploadService({ repository, storage, maxSizeBytes: 4 });

    await expect(
      service.upload('owner-id', 'conversation-id', {
        originalname: 'empty.txt',
        mimetype: 'text/plain',
        size: 0,
        buffer: Buffer.alloc(0),
      }),
    ).rejects.toMatchObject({ code: 'EMPTY_UPLOAD' });
    await expect(
      service.upload('owner-id', 'conversation-id', {
        originalname: 'large.txt',
        mimetype: 'text/plain',
        size: 5,
        buffer: Buffer.from('12345'),
      }),
    ).rejects.toMatchObject({ code: 'UPLOAD_TOO_LARGE', statusCode: 413 });
    await expect(
      service.upload('owner-id', 'conversation-id', {
        originalname: 'invalid.txt',
        mimetype: 'text/plain',
        size: 2,
        buffer: Buffer.from([0xff, 0xfe]),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_FILE_CONTENT' });

    expect(storage.write).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('cleans private bytes if the conversation is not owned by the caller', async () => {
    const { repository, storage } = createFixtures();
    repository.ownsConversation.mockResolvedValueOnce(false);
    const service = createUploadService({ repository, storage });
    const contents = Buffer.from('hello');

    await expect(
      service.upload('attacker-id', 'foreign-conversation', {
        originalname: 'hello.txt',
        mimetype: 'text/plain',
        size: contents.length,
        buffer: contents,
      }),
    ).rejects.toMatchObject({ code: 'CONVERSATION_NOT_FOUND', statusCode: 404 });

    expect(storage.write).not.toHaveBeenCalled();
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it('checks account ownership before reading a file', async () => {
    const { repository, storage } = createFixtures();
    repository.find.mockResolvedValueOnce(null);
    const service = createUploadService({ repository, storage });

    await expect(
      service.download('attacker-id', 'foreign-conversation', 'upload-id'),
    ).resolves.toBeNull();
    expect(repository.find).toHaveBeenCalledWith(
      'attacker-id',
      'foreign-conversation',
      'upload-id',
    );
    expect(storage.read).not.toHaveBeenCalled();
  });
});
