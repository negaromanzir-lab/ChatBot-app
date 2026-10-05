import createChatService from '../services/ai/chat.service.js';

/**
 * HTTP layer for chat.
 *
 * The controller only translates between HTTP and the service: it reads the
 * already-validated body, calls the service, and shapes the response. All
 * failure handling is delegated to the error middleware so every route reports
 * errors the same way.
 */
export function createChatController({ chatService } = {}) {
  const service = chatService ?? createChatService();

  async function sendMessage(req, res) {
    const { messages } = req.body;

    const message = await service.generateAssistantReply(messages);

    res.status(200).json({ message });
  }

  return { sendMessage };
}

export default createChatController;