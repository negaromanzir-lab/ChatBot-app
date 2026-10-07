import { useEffect, useMemo, useRef, useState } from 'react';
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
import { listAvailableModels } from '../services/modelService.js';
import {
  deleteConversationFile,
  downloadConversationFile,
  listConversationUploads,
  uploadConversationFile,
} from '../services/conversationService.js';

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
export function ChatPage({ user }) {
  const { preference, setPreference, theme, toggleTheme } = useTheme();
  const { preferences, updatePreference } = usePreferences();
  const [modelCatalog, setModelCatalog] = useState({ models: [], defaultModelId: null });
  const [modelCatalogError, setModelCatalogError] = useState(null);
  const selectedModelId = preferences.selectedModelId;
  const selectedModel = modelCatalog.models.find(({ id }) => id === selectedModelId);

  useEffect(() => {
    let active = true;
    listAvailableModels()
      .then((catalog) => {
        if (!active) return;
        setModelCatalog(catalog);
        const savedModel = catalog.models.find(({ id }) => id === preferences.selectedModelId);
        const selectedModel = savedModel?.id ?? catalog.defaultModelId;
        if (selectedModel && selectedModel !== preferences.selectedModelId) {
          updatePreference({ selectedModelId: selectedModel });
        }
      })
      .catch((caught) => {
        if (active) {
          setModelCatalogError(caught.message || 'Could not load available AI models.');
        }
      });
    return () => { active = false; };
  }, [preferences.selectedModelId, updatePreference]);

  const {
    conversations,
    activeId,
    activeConversation,
    messages,
    selectConversation,
    newChat,
    deleteConversation,
    renameConversation,
    removeAllConversations,
    setActiveMessages,
    createConversation,
    isLoading: conversationsLoading,
    error: conversationError,
  } = useConversations(user);

  const [uploads, setUploads] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const activeConversationIdRef = useRef(activeId);
  const uploadsConversationIdRef = useRef(null);
  const uploadRevisionRef = useRef(0);
  const attachmentIds = useMemo(() => uploads.map(({ id }) => id), [uploads]);
  activeConversationIdRef.current = activeId;

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
  } = useChatRequest({
    messages,
    conversationId: activeId,
    model: selectedModelId,
    fileIds: attachmentIds,
    setMessages: setActiveMessages,
    createConversation,
  });

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

  useEffect(() => {
    if (uploadsConversationIdRef.current === activeId) return undefined;

    let active = true;
    const revision = uploadRevisionRef.current;
    uploadsConversationIdRef.current = activeId;
    setUploads([]);
    setUploadError(null);
    if (!activeId) return () => { active = false; };

    listConversationUploads(activeId)
      .then((items) => {
        if (
          active
          && uploadsConversationIdRef.current === activeId
          && revision === uploadRevisionRef.current
        ) {
          setUploads(items);
        }
      })
      .catch((caught) => {
        if (active) {
          setUploadError(caught.message || 'Could not load conversation files.');
        }
      });
    return () => { active = false; };
  }, [activeId]);

  async function handleUploadFiles(files) {
    setUploadError(null);
    setIsUploading(true);
    let conversationId = activeId;
    try {
      if (!conversationId) {
        const conversation = await createConversation();
        conversationId = conversation.id;
        activeConversationIdRef.current = conversationId;
        uploadsConversationIdRef.current = conversationId;
      }
      for (const file of files) {
        const upload = await uploadConversationFile(conversationId, file);
        if (activeConversationIdRef.current === conversationId) {
          uploadRevisionRef.current += 1;
          setUploads((current) => [...current, upload]);
        }
      }
    } catch (caught) {
      setUploadError(caught.message || 'Could not upload the selected file.');
    } finally {
      setIsUploading(false);
    }
  }

  async function handleDownloadUpload(upload) {
    if (!activeId) return;
    try {
      const blob = await downloadConversationFile(activeId, upload.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = upload.name;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (caught) {
      setUploadError(caught.message || 'Could not download this file.');
    }
  }

  async function handleDeleteUpload(upload) {
    if (!activeId) return;
    setUploadError(null);
    try {
      await deleteConversationFile(activeId, upload.id);
      if (activeConversationIdRef.current === activeId) {
        setUploads((current) => current.filter((item) => item.id !== upload.id));
      }
    } catch (caught) {
      setUploadError(caught.message || 'Could not remove this file.');
    }
  }

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

    removeAllConversations().then(() => setIsSettingsOpen(false));
  }

  if (conversationsLoading) {
    return <main className="app-loading" role="status">Loading your conversations…</main>;
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
          displayName={user.fullName || user.email}
          onSelect={handleSelectConversation}
          onNewChat={handleNewChat}
          onDelete={deleteConversation}
          onRename={renameConversation}
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

      {conversationError && (
        <div className="composer__notice composer__notice--error" role="alert">
          {conversationError}
        </div>
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
        uploads={uploads}
        isUploading={isUploading}
        onUploadFiles={handleUploadFiles}
        onDownloadUpload={handleDownloadUpload}
        onDeleteUpload={handleDeleteUpload}
        uploadError={uploadError}
        onDismissUploadError={() => setUploadError(null)}
        supportsVision={selectedModel?.supportsVision}
      />

      <SettingsPanel
        open={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        themePreference={preference}
        onThemeChange={setPreference}
        models={modelCatalog.models}
        selectedModelId={selectedModelId}
        onModelChange={(modelId) => updatePreference({ selectedModelId: modelId })}
        modelError={modelCatalogError}
        displayName={preferences.displayName}
        onDisplayNameChange={(value) => updatePreference({ displayName: value })}
        onClearHistory={handleClearHistory}
      />
    </AppShell>
  );
}

export default ChatPage;
