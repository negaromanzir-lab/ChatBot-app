import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { deriveConversationTitle } from '../utils/text.js';
import {
  createConversation as createConversationRequest,
  deleteConversation as deleteConversationRequest,
  getConversation,
  importLocalHistory,
  listConversations,
  renameConversation as renameConversationRequest,
  setConversationArchived as setConversationArchivedRequest,
} from '../services/conversationService.js';

export function useConversations(user) {
  const [state, setState] = useState({ conversations: [], activeId: null });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  // Toggling the archive filter refetches, but it must not replace the page with
  // the initial loading state, so the spinner is tied to the signed-in user.
  const loadedUserIdRef = useRef(null);

  useEffect(() => {
    let active = true;
    if (!user?.id) {
      loadedUserIdRef.current = null;
      setIsLoading(false);
      return () => {
        active = false;
      };
    }
    if (loadedUserIdRef.current !== user.id) {
      loadedUserIdRef.current = user.id;
      setIsLoading(true);
    }
    setError(null);

    async function load() {
      try {
        const importedActiveId = await importLocalHistory(user.id);
        let conversations = await listConversations({ includeArchived: showArchived });
        if (importedActiveId) {
          const activeConversation = await getConversation(importedActiveId);
          conversations = conversations.map((conversation) =>
            conversation.id === importedActiveId ? activeConversation : conversation,
          );
        }
        if (!active) return;
        setState({
          conversations,
          activeId:
            importedActiveId && conversations.some(({ id }) => id === importedActiveId)
              ? importedActiveId
              : null,
        });
      } catch (caught) {
        if (active) {
          setError(caught.message || 'Could not load saved conversations.');
        }
      } finally {
        if (active) setIsLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [user?.id, showArchived]);

  const activeConversation = useMemo(
    () => state.conversations.find(({ id }) => id === state.activeId) ?? null,
    [state.conversations, state.activeId],
  );

  const selectConversation = useCallback(async (id) => {
    setError(null);
    try {
      const conversation = await getConversation(id);
      setState((current) => ({
        conversations: current.conversations.map((item) =>
          item.id === id ? conversation : item,
        ),
        activeId: id,
      }));
    } catch (caught) {
      setError(caught.message || 'Could not open this conversation.');
    }
  }, []);

  const newChat = useCallback(() => {
    setState((current) => ({ ...current, activeId: null }));
  }, []);

  const createConversation = useCallback(async () => {
    const conversation = await createConversationRequest();
    setState((current) => ({
      conversations: [conversation, ...current.conversations],
      activeId: conversation.id,
    }));
    return conversation;
  }, []);

  const deleteConversation = useCallback(async (id) => {
    setError(null);
    try {
      await deleteConversationRequest(id);
      setState((current) => {
        const remaining = current.conversations.filter(({ id: itemId }) => itemId !== id);
        return {
          conversations: remaining,
          activeId:
            current.activeId === id ? (remaining[0]?.id ?? null) : current.activeId,
        };
      });
      const current = state;
      const fallbackId =
        current.activeId === id
          ? current.conversations.find(({ id: itemId }) => itemId !== id)?.id ?? null
          : null;
      if (fallbackId) {
        const fallback = await getConversation(fallbackId);
        setState((currentState) => ({
          ...currentState,
          conversations: currentState.conversations.map((item) =>
            item.id === fallbackId ? fallback : item,
          ),
        }));
      }
    } catch (caught) {
      setError(caught.message || 'Could not delete this conversation.');
    }
  }, [state]);

  const renameConversation = useCallback(async (id, title) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    setError(null);
    try {
      const conversation = await renameConversationRequest(id, trimmed);
      setState((current) => ({
        ...current,
        conversations: current.conversations.map((item) =>
          item.id === id ? { ...item, ...conversation } : item,
        ),
      }));
    } catch (caught) {
      setError(caught.message || 'Could not rename this conversation.');
    }
  }, []);

  const applyArchived = useCallback(async (id, archived) => {
    setError(null);
    try {
      const updated = await setConversationArchivedRequest(id, archived);
      setState((current) => {
        const conversations = current.conversations.map((item) =>
          item.id === id ? { ...item, archivedAt: updated.archivedAt } : item,
        );
        const visible = showArchived
          ? conversations
          : conversations.filter((item) => !item.archivedAt);
        const activeId =
          current.activeId === id && !visible.some((item) => item.id === id)
            ? (visible[0]?.id ?? null)
            : current.activeId;
        return { conversations: visible, activeId };
      });
    } catch (caught) {
      setError(
        caught.message
          || `Could not ${archived ? 'archive' : 'unarchive'} this conversation.`,
      );
    }
  }, [showArchived]);

  const archiveConversation = useCallback(
    (id) => applyArchived(id, true),
    [applyArchived],
  );
  const unarchiveConversation = useCallback(
    (id) => applyArchived(id, false),
    [applyArchived],
  );

  const toggleShowArchived = useCallback(() => {
    setShowArchived((current) => !current);
  }, []);

  const removeAllConversations = useCallback(async () => {
    setError(null);
    try {
      await Promise.all(
        state.conversations.map(({ id }) => deleteConversationRequest(id)),
      );
      setState({ conversations: [], activeId: null });
    } catch (caught) {
      setError(caught.message || 'Could not delete all conversations.');
    }
  }, [state.conversations]);

  const setActiveMessages = useCallback((update, targetId) => {
    setState((current) => {
      const conversationId = targetId ?? current.activeId;
      if (!conversationId || current.activeId !== conversationId) return current;
      const now = Date.now();
      return {
        ...current,
        conversations: current.conversations.map((conversation) => {
          if (conversation.id !== conversationId) return conversation;
          const messages =
            typeof update === 'function' ? update(conversation.messages) : update;
          const firstUserMessage = messages.find((message) => message.sender === 'user');
          return {
            ...conversation,
            messages,
            title:
              conversation.title === 'New chat' && firstUserMessage
                ? deriveConversationTitle(messages)
                : conversation.title,
            updatedAt: now,
          };
        }),
      };
    });
  }, []);

  const updateConversationInfo = useCallback((id, updatedConversation) => {
    setState((current) => ({
      ...current,
      conversations: current.conversations.map((conversation) =>
        conversation.id === id ? { ...conversation, ...updatedConversation } : conversation,
      ),
    }));
  }, []);

  return {
    conversations: state.conversations,
    activeId: state.activeId,
    activeConversation,
    messages: activeConversation?.messages ?? [],
    isLoading,
    error,
    setError,
    selectConversation,
    newChat,
    createConversation,
    deleteConversation,
    renameConversation,
    archiveConversation,
    unarchiveConversation,
    showArchived,
    toggleShowArchived,
    removeAllConversations,
    setActiveMessages,
    updateConversationInfo,
  };
}

export default useConversations;
