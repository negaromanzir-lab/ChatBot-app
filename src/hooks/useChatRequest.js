import { useCallback, useEffect, useRef, useState } from 'react';
import { streamAssistantReply, createUserMessage } from '../services/chatService.js';
import { createConversationMessage } from '../services/conversationService.js';

/**
 * Owns the network lifecycle of a conversation: sending, regenerating, and
 * stopping.
 *
 * Failures are surfaced as a real `error` string and never replaced with a
 * fabricated assistant reply. Stopping is treated as a cancellation rather than
 * a failure, but it is *reported* — the user is told the reply was cut short,
 * and offered a retry, instead of being left with a dangling question.
 *
 * The service is injected so tests can drive the whole flow without a network or
 * module-mock plumbing.
 */

function findLastUserMessageIndex(messages) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].sender === 'user') return index;
  }
  return -1;
}

/**
 * @param {object} params
 * @param {Array} params.messages       Current conversation, oldest first.
 * @param {Function} params.setMessages Writer for the conversation, accepting an updater.
 * @param {Function} [params.service]
 */
export function useChatRequest({
  messages,
  conversationId,
  model,
  fileIds = [],
  setMessages,
  createConversation,
  service = streamAssistantReply,
  persistMessage = createConversationMessage,
} = {}) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState(null);
  const [wasStopped, setWasStopped] = useState(false);

  const abortControllerRef = useRef(null);
  const streamedReplyIdRef = useRef(null);
  // Guards against a second request slipping in before React has re-rendered
  // with isPending=true, which would interleave two conversations.
  const inFlightRef = useRef(false);

  // Cancel anything in flight if the component unmounts, so the fetch never
  // resolves against a dead component.
  useEffect(() => {
    return () => abortControllerRef.current?.abort();
  }, []);

  const runRequest = useCallback(
    async (conversation, conversationId) => {
      inFlightRef.current = true;
      setIsPending(true);
      setError(null);
      setWasStopped(false);
      streamedReplyIdRef.current = null;

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const reply = await service({
          messages: conversation,
          conversationId,
          model,
          fileIds,
          signal: controller.signal,
          onDelta: (_delta, partialReply) => {
            streamedReplyIdRef.current = partialReply.id;
            setMessages((current) => {
              const existingIndex = current.findIndex(
                (message) => message.id === partialReply.id,
              );
              if (existingIndex === -1) return [...current, partialReply];
              return current.map((message) =>
                message.id === partialReply.id ? partialReply : message,
              );
            }, conversationId);
          },
        });
        setMessages((current) => {
          const existing = current.some((message) => message.id === reply.id);
          if (!existing) return [...current, reply];
          return current.map((message) => (message.id === reply.id ? reply : message));
        }, conversationId);
      } catch (caught) {
        if (streamedReplyIdRef.current) {
          const finalStatus =
            caught?.code === 'CANCELLED' || controller.signal.aborted
              ? 'stopped'
              : 'interrupted';
          setMessages((current) =>
            current.map((message) =>
              message.id === streamedReplyIdRef.current
                ? { ...message, status: finalStatus }
                : message,
            ),
            conversationId,
          );
        }

        if (caught?.code === 'CANCELLED' || controller.signal.aborted) {
          // The user asked for this. Not an error, but the reply is missing.
          setWasStopped(true);
          return;
        }

        setError(
          caught instanceof Error
            ? caught.message
            : 'Something went wrong while contacting the server.',
        );
      } finally {
        inFlightRef.current = false;
        abortControllerRef.current = null;
        streamedReplyIdRef.current = null;
        setIsPending(false);
      }
    },
    [service, setMessages, model, fileIds],
  );

  /** Appends the user's turn, then asks the backend to answer it. */
  const sendMessage = useCallback(
    async (text) => {
      const content = typeof text === 'string' ? text.trim() : '';
      if (!content || inFlightRef.current) return;

      inFlightRef.current = true;
      try {
        let currentConversationId = conversationId;
        if (!currentConversationId) {
          const created = await createConversation();
          currentConversationId = created.id;
        }

        const userMessage = createUserMessage(content);
        const persistedUserMessage = await persistMessage(currentConversationId, userMessage);
        const conversation = [...messages, persistedUserMessage.message];
        setMessages(conversation, currentConversationId);

        await runRequest(conversation, currentConversationId);
      } catch (caught) {
        inFlightRef.current = false;
        setError(
          caught instanceof Error
            ? caught.message
            : 'Could not save the message. Please try again.',
        );
        setIsPending(false);
      }
    },
    [messages, conversationId, setMessages, runRequest, createConversation, persistMessage],
  );

  /**
   * Re-asks the last question with any assistant reply discarded.
   *
   * Everything after the final user message is dropped first, so regenerating
   * replaces the previous attempt instead of appending a second answer to it.
   */
  const regenerate = useCallback(async () => {
    if (inFlightRef.current) return;

    const lastUserIndex = findLastUserMessageIndex(messages);
    if (lastUserIndex === -1) return;

    const conversation = messages.slice(0, lastUserIndex + 1);
    setMessages(conversation, conversationId);

    await runRequest(conversation, conversationId);
  }, [messages, conversationId, setMessages, runRequest]);

  /** Aborts the in-flight request. Safe to call when nothing is in flight. */
  const stop = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const dismissStoppedNotice = useCallback(() => setWasStopped(false), []);

  return {
    isPending,
    error,
    wasStopped,
    canRegenerate: !isPending && findLastUserMessageIndex(messages) !== -1,
    sendMessage,
    regenerate,
    stop,
    clearError,
    dismissStoppedNotice,
  };
}