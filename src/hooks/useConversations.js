import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  loadConversations,
  saveConversations,
  clearConversations,
} from '../services/conversationStorage.js';
import { deriveConversationTitle } from '../utils/text.js';
import { createId } from '../utils/id.js';

/**
 * Owns the conversation list, which one is active, and persistence.
 *
 * Design notes:
 *
 * - Both the list and the active id live in a single state object, because they
 *   are persisted together and must not be able to disagree.
 * - There is deliberately no "empty conversation" record. `newChat` clears the
 *   selection instead of creating a blank row, so the history can never
 *   accumulate abandoned empty entries.
 * - `setActiveMessages` creates the conversation lazily on first write. That is
 *   what lets the composer treat "no conversation yet" and "conversation with
 *   no messages" as the same state, which is what the user experiences.
 */
export function useConversations() {
  const [state, setState] = useState(loadConversations);

  // `loadConversations` already caps what it returns, so persisting on every
  // state change is safe and keeps the write out of the hot typing path.
  useEffect(() => {
    saveConversations(state);
  }, [state]);

  const activeConversation = useMemo(
    () => state.conversations.find((conversation) => conversation.id === state.activeId) ?? null,
    [state.conversations, state.activeId],
  );

  const selectConversation = useCallback((id) => {
    setState((current) =>
      current.activeId === id ? current : { ...current, activeId: id },
    );
  }, []);

  /** Starts an empty chat. Any messages already stored are left untouched. */
  const newChat = useCallback(() => {
    setState((current) =>
      current.activeId === null ? current : { ...current, activeId: null },
    );
  }, []);

  const deleteConversation = useCallback((id) => {
    setState((current) => {
      const remaining = current.conversations.filter((conversation) => conversation.id !== id);
      if (remaining.length === current.conversations.length) return current;

      return {
        conversations: remaining,
        // Fall back to the most recently updated remaining conversation so the
        // user lands somewhere instead of on an empty screen.
        activeId:
          current.activeId === id
            ? (remaining[0]?.id ?? null)
            : current.activeId,
      };
    });
  }, []);

  const renameConversation = useCallback((id, title) => {
    const trimmed = title.trim();
    if (!trimmed) return;

    setState((current) => ({
      ...current,
      conversations: current.conversations.map((conversation) =>
        conversation.id === id ? { ...conversation, title: trimmed } : conversation,
      ),
    }));
  }, []);

  const removeAllConversations = useCallback(() => {
    clearConversations();
    setState({ conversations: [], activeId: null });
  }, []);

  /**
   * Updates the active conversation's messages, creating it if there is none.
   * Accepts an updater function so callers can append without stale state.
   */
  const setActiveMessages = useCallback((update) => {
    setState((current) => {
      const now = Date.now();

      if (current.activeId === null) {
        const messages = typeof update === 'function' ? update([]) : update;
        const id = createId();

        return {
          activeId: id,
          conversations: [
            {
              id,
              // Naming from the first user message means the sidebar is never
              // full of "New chat" rows once someone has actually said
              // something.
              title: deriveConversationTitle(messages),
              messages,
              createdAt: now,
              updatedAt: now,
            },
          ],
        };
      }

      return {
        ...current,
        conversations: current.conversations.map((conversation) => {
          if (conversation.id !== current.activeId) return conversation;

          const messages =
            typeof update === 'function'
              ? update(conversation.messages)
              : update;

          return {
            ...conversation,
            messages,
            title: deriveConversationTitle(messages),
            updatedAt: now,
          };
        }),
      };
    });
  }, []);

  return {
    conversations: state.conversations,
    activeId: state.activeId,
    activeConversation,
    messages: activeConversation?.messages ?? [],
    selectConversation,
    newChat,
    deleteConversation,
    renameConversation,
    removeAllConversations,
    setActiveMessages,
  };
}