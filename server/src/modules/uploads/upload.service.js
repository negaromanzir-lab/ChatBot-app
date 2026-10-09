import { randomUUID } from 'node:crypto';
import path from 'node:path';
import ApiError from '../../utils/ApiError.js';
import logger from '../../config/logger.js';
import mammoth from 'mammoth';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createLocalFileStorage } from './localFileStorage.js';
import { createUploadRepository } from './upload.repository.js';
import { createRagService } from '../rag/rag.service.js';

const DOCX_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const MAX_EXTRACTED_TEXT_LENGTH = 100_000;
const MAX_DOCX_EXPANDED_BYTES = 25 * 1024 * 1024;
const MAX_DOCX_ENTRIES = 1000;
const MAX_PDF_PAGES = 100;
const MAX_ATTACHMENTS_PER_CHAT = 10;
const MAX_IMAGE_BYTES_PER_CHAT = 20 * 1024 * 1024;

const MIME_BY_EXTENSION = new Map([
  ['.csv', new Set(['text/csv', 'application/csv'])],
  ['.docx', new Set([DOCX_MIME_TYPE])],
  ['.jpeg', new Set(['image/jpeg'])],
  ['.jpg', new Set(['image/jpeg'])],
  ['.md', new Set(['text/markdown', 'text/plain', 'text/x-markdown'])],
  ['.pdf', new Set(['application/pdf'])],
  ['.png', new Set(['image/png'])],
  ['.txt', new Set(['text/plain'])],
  ['.webp', new Set(['image/webp'])],
]);

const MAX_NAME_LENGTH = 255;

export function sanitizeUploadName(name) {
  const basename = path.posix.basename(String(name).replaceAll('\\', '/'));
  const safe = [...basename]
    .filter((character) => {
      const code = character.codePointAt(0);
      return code > 0x1f && (code < 0x7f || code > 0x9f);
    })
    .join('')
    .replace(/[<>:"/\\|?*]/g, '_')
    .trim()
    .slice(0, MAX_NAME_LENGTH);
  return safe || 'upload';
}

function validateFile(file, maxSizeBytes) {
  if (!file || !Buffer.isBuffer(file.buffer) || file.size !== file.buffer.length) {
    throw ApiError.badRequest('INVALID_UPLOAD', 'A file is required.');
  }
  if (!file.size) {
    throw ApiError.badRequest('EMPTY_UPLOAD', 'The selected file is empty.');
  }
  if (file.size > maxSizeBytes) {
    throw ApiError.payloadTooLarge('UPLOAD_TOO_LARGE', 'The file exceeds the upload size limit.');
  }

  const name = sanitizeUploadName(file.originalname);
  const extension = path.extname(name).toLowerCase();
  const allowedMimeTypes = MIME_BY_EXTENSION.get(extension);
  const contentType = String(file.mimetype ?? '').toLowerCase();
  if (!allowedMimeTypes?.has(contentType)) {
    throw ApiError.badRequest(
      'UNSUPPORTED_FILE_TYPE',
      'Upload a PDF, DOCX, text, Markdown, PNG, JPEG, or WebP file.',
    );
  }

  if (extension === '.pdf' && !file.buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    throw ApiError.badRequest('INVALID_FILE_CONTENT', 'The file content does not match its type.');
  }
  if (extension === '.png' && !file.buffer.subarray(0, 8).equals(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  )) {
    throw ApiError.badRequest('INVALID_FILE_CONTENT', 'The file content does not match its type.');
  }
  if (
    ['.jpeg', '.jpg'].includes(extension) &&
    !(file.buffer[0] === 0xff && file.buffer[1] === 0xd8 && file.buffer[2] === 0xff)
  ) {
    throw ApiError.badRequest('INVALID_FILE_CONTENT', 'The file content does not match its type.');
  }
  if (
    extension === '.webp' &&
    (file.buffer.toString('ascii', 0, 4) !== 'RIFF' ||
      file.buffer.toString('ascii', 8, 12) !== 'WEBP')
  ) {
    throw ApiError.badRequest('INVALID_FILE_CONTENT', 'The file content does not match its type.');
  }
  if (['.txt', '.md', '.csv'].includes(extension)) {
    let text;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(file.buffer);
    } catch (cause) {
      throw ApiError.badRequest('INVALID_FILE_CONTENT', 'Text files must use UTF-8 encoding.', {
        cause: cause.message,
      });
    }
    if (
      [...text].some((character) => {
        const code = character.codePointAt(0);
        return code < 0x20 && ![0x09, 0x0a, 0x0d].includes(code);
      })
    ) {
      throw ApiError.badRequest('INVALID_FILE_CONTENT', 'The text file contains binary data.');
    }
  }
  if (extension === '.docx' && file.buffer.subarray(0, 4).toString('hex') !== '504b0304') {
    throw ApiError.badRequest('INVALID_FILE_CONTENT', 'The file content does not match its type.');
  }

  return { name, contentType, extension };
}

function validateDocxArchive(buffer) {
  const minimumOffset = Math.max(0, buffer.length - 65_557);
  let endRecordOffset = -1;
  for (let offset = buffer.length - 22; offset >= minimumOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      endRecordOffset = offset;
      break;
    }
  }
  if (endRecordOffset < 0) {
    throw ApiError.badRequest('INVALID_DOCUMENT', 'The DOCX document could not be processed.');
  }

  const entryCount = buffer.readUInt16LE(endRecordOffset + 10);
  const diskNumber = buffer.readUInt16LE(endRecordOffset + 4);
  const directoryDiskNumber = buffer.readUInt16LE(endRecordOffset + 6);
  const entriesOnDisk = buffer.readUInt16LE(endRecordOffset + 8);
  const directorySize = buffer.readUInt32LE(endRecordOffset + 12);
  const directoryOffset = buffer.readUInt32LE(endRecordOffset + 16);
  if (
    entryCount === 0xffff
    || diskNumber !== 0
    || directoryDiskNumber !== 0
    || entriesOnDisk !== entryCount
    || entryCount > MAX_DOCX_ENTRIES
    || directorySize === 0xffffffff
    || directoryOffset === 0xffffffff
    || directoryOffset + directorySize > endRecordOffset
  ) {
    throw ApiError.badRequest('INVALID_DOCUMENT', 'The DOCX document exceeds processing limits.');
  }

  let offset = directoryOffset;
  let expandedBytes = 0;
  let hasDocumentXml = false;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > directoryOffset + directorySize || buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw ApiError.badRequest('INVALID_DOCUMENT', 'The DOCX document could not be processed.');
    }
    const flags = buffer.readUInt16LE(offset + 8);
    const method = buffer.readUInt16LE(offset + 10);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const entryEnd = offset + 46 + fileNameLength + extraLength + commentLength;
    if (
      entryEnd > directoryOffset + directorySize
      || (flags & 1) !== 0
      || ![0, 8].includes(method)
      || uncompressedSize === 0xffffffff
    ) {
      throw ApiError.badRequest('INVALID_DOCUMENT', 'The DOCX document could not be processed.');
    }
    expandedBytes += uncompressedSize;
    if (expandedBytes > MAX_DOCX_EXPANDED_BYTES) {
      throw ApiError.payloadTooLarge(
        'DOCUMENT_PROCESSING_LIMIT',
        'The DOCX document expands beyond the processing limit.',
      );
    }
    const fileName = buffer.toString('utf8', offset + 46, offset + 46 + fileNameLength);
    if (fileName === 'word/document.xml') hasDocumentXml = true;
    offset = entryEnd;
  }
  if (!hasDocumentXml) {
    throw ApiError.badRequest('INVALID_DOCUMENT', 'The DOCX document could not be processed.');
  }
}

async function extractText(file, extension) {
  if (['.txt', '.md', '.csv'].includes(extension)) {
    return new TextDecoder('utf-8', { fatal: true }).decode(file.buffer)
      .slice(0, MAX_EXTRACTED_TEXT_LENGTH);
  }
  if (extension === '.docx') {
    validateDocxArchive(file.buffer);
    try {
      const result = await mammoth.extractRawText({ buffer: file.buffer });
      return result.value.slice(0, MAX_EXTRACTED_TEXT_LENGTH);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw ApiError.badRequest(
        'INVALID_DOCUMENT',
        'The DOCX document could not be processed.',
      );
    }
  }
  if (extension === '.pdf') {
    let loadingTask;
    let document;
    try {
      loadingTask = getDocument({
        data: new Uint8Array(file.buffer),
        isEvalSupported: false,
        useSystemFonts: true,
      });
      document = await loadingTask.promise;
      if (document.numPages > MAX_PDF_PAGES) {
        throw ApiError.payloadTooLarge(
          'DOCUMENT_PROCESSING_LIMIT',
          `PDF documents must have ${MAX_PDF_PAGES} pages or fewer.`,
        );
      }
      let text = '';
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        const page = await document.getPage(pageNumber);
        const content = await page.getTextContent();
        text += `[Page ${pageNumber}]\n${content.items.map((item) => item.str ?? '').join(' ')}\n`;
        if (text.length >= MAX_EXTRACTED_TEXT_LENGTH) break;
      }
      return text.slice(0, MAX_EXTRACTED_TEXT_LENGTH);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw ApiError.badRequest(
        'INVALID_DOCUMENT',
        'The PDF document could not be processed.',
      );
    } finally {
      try {
        await loadingTask?.destroy();
      } catch (error) {
        logger.warn({ errorName: error?.name ?? 'Error' }, 'Could not close PDF document cleanly');
      }
    }
  }
  return null;
}

export function createUploadService({
  repository: injectedRepository,
  storage: injectedStorage,
  documentIndexer: injectedDocumentIndexer,
  maxSizeBytes = 10 * 1024 * 1024,
} = {}) {
  const repository = injectedRepository ?? createUploadRepository();
  const storage = injectedStorage ?? createLocalFileStorage();
  let documentIndexer = injectedDocumentIndexer;
  if (documentIndexer === undefined && !injectedRepository) {
    documentIndexer = createRagService();
  }

  async function list(userId, conversationId) {
    return repository.list(userId, conversationId);
  }

  async function upload(userId, conversationId, file) {
    if (!await repository.ownsConversation(userId, conversationId)) {
      throw ApiError.notFound('CONVERSATION_NOT_FOUND', 'Conversation not found.');
    }
    const { name, contentType, extension } = validateFile(file, maxSizeBytes);
    const extractedText = await extractText(file, extension);
    const storageKey = randomUUID();
    await storage.write(storageKey, file.buffer);
    let persisted = false;
    try {
      const uploadRecord = await repository.create(userId, conversationId, {
        id: storageKey,
        name,
        contentType,
        size: file.size,
        extractedText,
      });
      if (!uploadRecord) {
        throw ApiError.notFound('CONVERSATION_NOT_FOUND', 'Conversation not found.');
      }
      persisted = true;
      const indexStatus = extractedText && documentIndexer
        ? (await documentIndexer.indexDocument({
          userId,
          conversationId,
          uploadId: uploadRecord.id,
          text: extractedText,
        })).status
        : undefined;
      return {
        ...uploadRecord,
        ...(indexStatus ? { indexStatus } : {}),
      };
    } catch (error) {
      if (persisted) {
        try {
          await repository.delete(userId, conversationId, storageKey);
        } catch (cleanupError) {
          logger.error(
            { err: cleanupError, uploadId: storageKey },
            'Failed to clean up an upload record after indexing failed',
          );
        }
      }
      try {
        await storage.delete(storageKey);
      } catch (cleanupError) {
        logger.error({ err: cleanupError, uploadId: storageKey }, 'Failed to clean up an unrecorded upload');
      }
      throw error;
    }
  }

  async function download(userId, conversationId, uploadId) {
    const record = await repository.find(userId, conversationId, uploadId);
    if (!record) return null;
    const contents = await storage.read(record.storageKey);
    return { upload: record, contents };
  }

  async function remove(userId, conversationId, uploadId) {
    const record = await repository.find(userId, conversationId, uploadId);
    if (!record) return false;
    const storageKey = await repository.delete(userId, conversationId, uploadId);
    if (!storageKey) return false;
    try {
      await storage.delete(storageKey);
    } catch (error) {
      logger.error({ err: error, uploadId }, 'Failed to delete a private uploaded file');
      throw ApiError.internal(
        'UPLOAD_DELETE_FAILED',
        'The upload record was deleted, but its private file could not be removed.',
      );
    }
    return true;
  }

  async function listStorageKeysForConversation(userId, conversationId) {
    return repository.listStorageKeysForConversation(userId, conversationId);
  }

  async function getForChat(
    userId,
    conversationId,
    uploadIds,
    { supportsVision = false } = {},
  ) {
    if (!Array.isArray(uploadIds) || uploadIds.length === 0) return [];
    if (uploadIds.length > MAX_ATTACHMENTS_PER_CHAT) {
      throw ApiError.badRequest(
        'TOO_MANY_ATTACHMENTS',
        `A chat request can include at most ${MAX_ATTACHMENTS_PER_CHAT} files.`,
      );
    }
    const records = await repository.findForChat(userId, conversationId, uploadIds);
    if (records.length !== new Set(uploadIds).size) {
      throw ApiError.notFound('UPLOAD_NOT_FOUND', 'One or more attached files were not found.');
    }
    const images = records.filter((record) => record.contentType.startsWith('image/'));
    if (images.length && !supportsVision) {
      throw ApiError.badRequest(
        'AI_MODEL_DOES_NOT_SUPPORT_IMAGES',
        'Choose a vision-capable model to ask questions about attached images.',
      );
    }
    const imageBytes = images
      .reduce((total, record) => total + record.size, 0);
    if (imageBytes > MAX_IMAGE_BYTES_PER_CHAT) {
      throw ApiError.payloadTooLarge(
        'IMAGE_CONTEXT_TOO_LARGE',
        'The attached images exceed the maximum combined size for a chat request.',
      );
    }
    return Promise.all(records.map(async (record) => ({
      id: record.id,
      name: record.name,
      contentType: record.contentType,
      size: record.size,
      extractedText: record.extractedText,
      contents: record.contentType.startsWith('image/')
        ? await storage.read(record.storageKey)
        : null,
    })));
  }

  async function removeStorageKeys(storageKeys) {
    for (const storageKey of storageKeys) {
      try {
        await storage.delete(storageKey);
      } catch (error) {
        logger.error(
          { err: error, uploadId: storageKey },
          'Failed to delete a private file while removing its conversation',
        );
      }
    }
  }

  return {
    list,
    upload,
    download,
    remove,
    getForChat,
    listStorageKeysForConversation,
    removeStorageKeys,
  };
}

export default createUploadService;
