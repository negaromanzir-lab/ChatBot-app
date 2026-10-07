import createChatService from '../services/ai/chat.service.js';
import ApiError from '../utils/ApiError.js';
import logger from '../config/logger.js';

function writeEvent(res, event) {
  if (res.destroyed || res.writableEnded) return false;
  return res.write(`data: ${JSON.stringify(event)}\n\n`);
}

async function waitForDrain(res, signal) {
  if (res.destroyed || signal.aborted) return false;

  return new Promise((resolve) => {
    function cleanup() {
      res.off('drain', onDrain);
      res.off('close', onClose);
      signal.removeEventListener('abort', onAbort);
    }
    function onDrain() {
      cleanup();
      resolve(true);
    }
    function onClose() {
      cleanup();
      resolve(false);
    }
    function onAbort() {
      cleanup();
      resolve(false);
    }

    res.once('drain', onDrain);
    res.once('close', onClose);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

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
    const { messages, stream, model, conversationId, fileIds } = req.body;
    const options = {
      model,
      userId: req.user?.id,
      conversationId,
      fileIds,
    };

    if (!stream) {
      const message = await service.generateAssistantReply(messages, options);
      res.status(200).json({ message });
      return;
    }

    const controller = new AbortController();
    const abortOnDisconnect = () => {
      if (!res.writableEnded) controller.abort();
    };
    res.once('close', abortOnDisconnect);

    res.status(200);
    res.set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();

    let content = '';
    try {
      for await (const chunk of service.streamAssistantReply(messages, {
        signal: controller.signal,
        ...options,
      })) {
        if (controller.signal.aborted) break;
        content += chunk;
        if (!writeEvent(res, { type: 'delta', content: chunk })) {
          if (!(await waitForDrain(res, controller.signal))) break;
        }
      }

      if (controller.signal.aborted || res.destroyed) return;
      if (!content) {
        throw ApiError.badGateway(
          'AI_PROVIDER_EMPTY_RESPONSE',
          'The AI provider returned an empty response.',
        );
      }

      writeEvent(res, {
        type: 'done',
        message: { role: 'assistant', content },
      });
      res.end();
    } catch (error) {
      if (controller.signal.aborted || res.destroyed) return;

      const isOperational = error instanceof ApiError;
      const code = isOperational ? error.code : 'INTERNAL_ERROR';
      const message = isOperational ? error.message : 'An unexpected error occurred.';

      logger.error(
        { requestId: req.id, code },
        'Streaming chat request failed',
      );
      writeEvent(res, {
        type: 'error',
        error: { code, message, requestId: req.id },
      });
      res.end();
    } finally {
      res.off('close', abortOnDisconnect);
    }
  }

  return { sendMessage };
}

export default createChatController;