import { useCallback, useEffect, useRef, useState } from 'react';
import { requestAssistantReply, createUserMessage } from '../services/chatService.js';

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
export function useChatRequest({ messages, setMessages, service = requestAssistantReply } = {}) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState(null);
  const [wasStopped, setWasStopped] = useState(false);

  const abortControllerRef = useRef(null);
  // Guards against a second request slipping in before React has re-rendered
  // with isPending=true, which would interleave two conversations.
  const inFlightRef = useRef(false);

  // Cancel anything in flight if the component unmounts, so the fetch never
  // resolves against a dead component.
  useEffect(() => {
    return () => abortControllerRef.current?.abort();
  }, []);

  const runRequest = useCallback(
    async (conversation) => {
      inFlightRef.current = true;
      setIsPending(true);
      setError(null);
      setWasStopped(false);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const reply = await service({
          messages: conversation,
          signal: controller.signal,
        });
        setMessages((current) => [...current, reply]);
      } catch (caught) {
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
        setIsPending(false);
      }
    },
    [service, setMessages],
  );

  /** Appends the user's turn, then asks the backend to answer it. */
  const sendMessage = useCallback(
    async (text) => {
      const content = typeof text === 'string' ? text.trim() : '';
      if (!content || inFlightRef.current) return;

      const conversation = [...messages, createUserMessage(content)];

      // Persist the question immediately, so it survives even if the request
      // fails or the tab is closed mid-flight.
      setMessages(conversation);

      await runRequest(conversation);
    },
    [messages, setMessages, runRequest],
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
    setMessages(conversation);

    await runRequest(conversation);
  }, [messages, setMessages, runRequest]);

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