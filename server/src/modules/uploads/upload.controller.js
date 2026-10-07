import ApiError from '../../utils/ApiError.js';
import { createUploadService } from './upload.service.js';

export function createUploadController({ uploadService } = {}) {
  let service = uploadService;
  function getService() {
    service ??= createUploadService();
    return service;
  }

  async function list(req, res) {
    const uploads = await getService().list(req.user.id, req.params.id);
    if (!uploads) throw ApiError.notFound('CONVERSATION_NOT_FOUND', 'Conversation not found.');
    res.status(200).json({ uploads });
  }

  async function upload(req, res) {
    const conversationId = req.params.id ?? req.body.conversationId;
    const uploadRecord = await getService().upload(req.user.id, conversationId, req.file);
    res.status(201).json({ upload: uploadRecord });
  }

  async function download(req, res) {
    const result = await getService().download(
      req.user.id,
      req.params.id,
      req.params.uploadId,
    );
    if (!result) throw notFound();

    res.set({
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.attachment(result.upload.name);
    res.type(result.upload.contentType);
    res.status(200).send(result.contents);
  }

  async function remove(req, res) {
    const removed = await getService().remove(
      req.user.id,
      req.params.id,
      req.params.uploadId,
    );
    if (!removed) throw notFound();
    res.status(204).end();
  }

  return { list, upload, download, remove };
}

function notFound() {
  return ApiError.notFound('UPLOAD_NOT_FOUND', 'Upload not found.');
}

export default createUploadController;
