import { useEffect, useState } from 'react';
import { AppShell } from '../components/layout/AppShell.jsx';
import { ChatHeader } from '../components/layout/ChatHeader.jsx';
import { Sidebar } from '../components/sidebar/Sidebar.jsx';
import { MessageList } from '../components/chat/MessageList.jsx';
import { WelcomeScreen } from '../components/chat/WelcomeScreen.jsx';
import { Composer } from '../components/input/Composer.jsx';
import { SettingsPanel } from '../components/settings/SettingsPanel.jsx';
import { useConversations } from '../hooks/useConversations.js';
import { useChatRequest } from '../hooks/useChatRequest.js';
import { useTheme } from '../hooks/useTheme.js';
import { usePreferences } from '../hooks/usePreferences.js';
import { useMediaQuery, DESKTOP_QUERY } from '../hooks/useMediaQuery.js';

/**
 * Page-level composition: owns no rendering logic of its own, only the wiring.
 *
 * Three independent state machines meet here — persisted conversations, the
 * network lifecycle of a reply, and UI chrome (drawer/dialog). Each stays in
 * its own hook; this component only connects them:
 *
 * - `useConversations.messages` is the source of truth for the transcript and
 *   `setActiveMessages` is the writer handed to the request hook, so a message
 *   is persisted the moment it exists rather than when a reply arrives.
 * - The request hook never sees components; it only sees messages and a setter.
 * - The sidebar drawer is pure chrome: it closes on selection, on backdrop or
 *   Escape, and whenever the viewport grows past the breakpoint.
 */
export function ChatPage() {
  const { preference, setPreference, theme, toggleTheme } = useTheme();
  const { preferences, updatePreference } = usePreferences();

  const {
    conversations,
    activeId,
    activeConversation,
    messages,
    selectConversation,
    newChat,
    deleteConversation,
    removeAllConversations,
    setActiveMessages,
  } = useConversations();

  const {
    isPending,
    error,
    wasStopped,
    canRegenerate,
    sendMessage,
    regenerate,
    stop,
    clearError,
    dismissStoppedNotice,
  } = useChatRequest({ messages, setMessages: setActiveMessages });

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const isDesktop = useMediaQuery(DESKTOP_QUERY);

  // Growing past the breakpoint must never leave a drawer stranded on screen.
  useEffect(() => {
    if (isDesktop) setIsSidebarOpen(false);
  }, [isDesktop]);

  useEffect(() => {
    if (!isSidebarOpen || isDesktop) return undefined;

    function handleKeyDown(event) {
      if (event.key === 'Escape') setIsSidebarOpen(false);
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSidebarOpen, isDesktop]);

  function handleNewChat() {
    newChat();
    setIsSidebarOpen(false);
  }

  function handleSelectConversation(id) {
    selectConversation(id);
    setIsSidebarOpen(false);
  }

  function handleClearHistory() {
    const confirmed =
      typeof window.confirm !== 'function' ||
      window.confirm('Delete all conversations? This cannot be undone.');

    if (!confirmed) return;

    removeAllConversations();
    setIsSettingsOpen(false);
  }

  const hasMessages = messages.length > 0;

  return (
    <AppShell
      isSidebarOpen={isSidebarOpen}
      onCloseSidebar={() => setIsSidebarOpen(false)}
      sidebar={
        <Sidebar
          conversations={conversations}
          activeId={activeId}
          displayName={preferences.displayName}
          onSelect={handleSelectConversation}
          onNewChat={handleNewChat}
          onDelete={deleteConversation}
          onClose={() => setIsSidebarOpen(false)}
          onOpenSettings={() => setIsSettingsOpen(true)}
        />
      }
      header={
        <ChatHeader
          title={activeConversation?.title ?? 'New chat'}
          theme={theme}
          onToggleTheme={toggleTheme}
          onOpenSidebar={() => setIsSidebarOpen(true)}
        />
      }
    >
      {hasMessages ? (
        <MessageList messages={messages} isPending={isPending} onRegenerate={regenerate} />
      ) : (
        <WelcomeScreen onSuggest={sendMessage} />
      )}

      <Composer
        onSend={sendMessage}
        onStop={stop}
        onRetry={canRegenerate ? regenerate : undefined}
        isPending={isPending}
        error={error}
        onDismissError={clearError}
        wasStopped={wasStopped}
        onDismissStopped={dismissStoppedNotice}
      />

      <SettingsPanel
        open={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        themePreference={preference}
        onThemeChange={setPreference}
        displayName={preferences.displayName}
        onDisplayNameChange={(value) => updatePreference({ displayName: value })}
        onClearHistory={handleClearHistory}
      />
    </AppShell>
  );
}

export default ChatPage;
