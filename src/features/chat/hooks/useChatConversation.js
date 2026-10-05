import { useCallback, useEffect, useRef, useState } from 'react';
import { requestAssistantReply } from '../services/chatService.js';

/**
 * Seeded starting transcript.
 *
 * These are fixtures for the initial render only. They are sent to the backend
 * as real conversation history, so the first reply is answered in context.
 */
export const INITIAL_MESSAGES = [
  { message: 'hello chatbot', sender: 'user', id: 'id1' },
  { message: 'Hello! How can I help you?', sender: 'robot', id: 'id2' },
  { message: 'can you get me todays date?', sender: 'user', id: 'id3' },
  { message: 'Today is September 27', sender: 'robot', id: 'id4' },
];

/**
 * Owns the conversation and everything the UI needs to render it.
 *
 * Extracted from App so that components stay presentational: they render
 * `messages`/`isPending`/`error` and call `sendMessage`. The AI call is injected
 * via `service`, which lets tests drive the flow without any network or mock
 * module plumbing.
 *
 * Failures are surfaced as a real `error` value and never replaced with a
 * fabricated assistant reply.
 */
export function useChatConversation({
  initialMessages = INITIAL_MESSAGES,
  service = requestAssistantReply,
} = {}) {
  const [messages, setMessages] = useState(initialMessages);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState(null);

  const abortControllerRef = useRef(null);
  // Guards against a second send slipping in before React has re-rendered with
  // isPending=true, which would interleave two conversations.
  const inFlightRef = useRef(false);

  // Abort any in-flight provider request if the component unmounts, so the
  // fetch does not resolve against a dead component.
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const sendMessage = useCallback(
    async (text) => {
      const content = text.trim();
      if (!content || inFlightRef.current) {
        return;
      }

      const userMessage = {
        message: content,
        sender: 'user',
        id: crypto.randomUUID(),
      };

      const conversation = [...messages, userMessage];

      inFlightRef.current = true;
      setMessages(conversation);
      setIsPending(true);
      setError(null);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const reply = await service({
          messages: conversation,
          signal: controller.signal,
        });
        setMessages((current) => [...current, reply]);
      } catch (caught) {
        // A user-initiated cancellation is not a failure to report.
        if (caught?.code === 'CANCELLED' || controller.signal.aborted) {
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
    [messages, service],
  );

  const clearError = useCallback(() => setError(null), []);

  return { messages, isPending, error, sendMessage, clearError };
}

export default useChatConversation;