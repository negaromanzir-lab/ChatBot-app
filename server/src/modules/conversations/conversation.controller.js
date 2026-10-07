import ApiError from '../../utils/ApiError.js';
import createConversationService from './conversation.service.js';

export function createConversationController({ conversationService } = {}) {
  let service = conversationService;
  function getService() {
    service ??= createConversationService();
    return service;
  }

  async function create(req, res) {
    const conversation = await getService().create(req.user.id, req.body);
    res.status(201).json({ conversation });
  }

  async function list(req, res) {
    const conversations = await getService().list(req.user.id);
    res.status(200).json({ conversations });
  }

  async function get(req, res) {
    const conversation = await getService().get(req.user.id, req.params.id);
    if (!conversation) throw notFound();
    res.status(200).json({ conversation });
  }

  async function rename(req, res) {
    const conversation = await getService().rename(
      req.user.id,
      req.params.id,
      req.body.title,
    );
    if (!conversation) throw notFound();
    res.status(200).json({ conversation });
  }

  async function remove(req, res) {
    const deleted = await getService().remove(req.user.id, req.params.id);
    if (!deleted) throw notFound();
    res.status(204).end();
  }

  async function addMessage(req, res) {
    const result = await getService().addMessage(
      req.user.id,
      req.params.id,
      req.body,
    );
    if (!result) throw notFound();
    res.status(201).json(result);
  }

  return { create, list, get, rename, remove, addMessage };
}

function notFound() {
  return ApiError.notFound('CONVERSATION_NOT_FOUND', 'Conversation not found.');
}

export default createConversationController;
