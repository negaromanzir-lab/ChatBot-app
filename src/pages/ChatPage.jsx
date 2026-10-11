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

const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_FILES_PER_MESSAGE = 10;
const MAX_IMAGE_BYTES_PER_MESSAGE = 20 * 1024 * 1024;
const SUPPORTED_FILE_TYPES = new Map([
  ['.csv', ['text/csv', 'application/csv']],
  ['.docx', ['application/vnd.openxmlformats-officedocument.wordprocessingml.document']],
  ['.gif', ['image/gif']],
  ['.jpeg', ['image/jpeg']],
  ['.jpg', ['image/jpeg']],
  ['.md', ['text/markdown', 'text/plain', 'text/x-markdown']],
  ['.pdf', ['application/pdf']],
  ['.png', ['image/png']],
  ['.txt', ['text/plain']],
  ['.webp', ['image/webp']],
]);

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
  const { preference, setPreference, theme } = useTheme();
  const {
    preferences,
    updatePreference,
    isLoading: preferencesLoading,
    isSaving: preferencesSaving,
    error: preferencesError,
  } = usePreferences(user.id);
  const [modelCatalog, setModelCatalog] = useState({ models: [], defaultModelId: null });
  const [modelCatalogError, setModelCatalogError] = useState(null);
  const selectedModelId = preferences.selectedModelId;
  const selectedModel = modelCatalog.models.find(({ id }) => id === selectedModelId);

  useEffect(() => {
    if (!preferencesLoading) setPreference(preferences.theme);
  }, [preferencesLoading, preferences.theme, setPreference]);

  useEffect(() => {
    if (preferencesLoading) return undefined;
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
  }, [preferences.selectedModelId, preferencesLoading, updatePreference]);

  const {
    conversations,
    activeId,
    activeConversation,
    messages,
    selectConversation,
    newChat,
    deleteConversation,
    renameConversation,
    archiveConversation,
    unarchiveConversation,
    showArchived,
    toggleShowArchived,
    removeAllConversations,
    setActiveMessages,
    updateConversationInfo,
    createConversation,
    isLoading: conversationsLoading,
    error: conversationError,
  } = useConversations(user);

  const [uploads, setUploads] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [uploadError, setUploadError] = useState(null);
  const activeConversationIdRef = useRef(activeId);
  const uploadsConversationIdRef = useRef(null);
  const uploadRevisionRef = useRef(0);
  const previewUrlsRef = useRef(new Map());
  const attachmentIds = useMemo(() => uploads.map(({ id }) => id), [uploads]);
  activeConversationIdRef.current = activeId;

  const {
    isPending,
    toolStatus,
    error,
    wasStopped,
    canRegenerate,
    sendMessage,
    regenerate,
    editAndResend,
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
    onConversationUpdated: updateConversationInfo,
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
    function handleShortcut(event) {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === 'k') {
        event.preventDefault();
        document.getElementById('conversation-search')?.focus();
      } else if (key === 'o' && event.shiftKey) {
        event.preventDefault();
        newChat();
        setIsSidebarOpen(false);
      } else if (key === ',') {
        event.preventDefault();
        setIsSettingsOpen(true);
      }
    }

    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [newChat]);

  useEffect(() => {
    if (uploadsConversationIdRef.current === activeId) return undefined;

    let active = true;
    const revision = uploadRevisionRef.current;
    const previewUrls = previewUrlsRef.current;
    uploadsConversationIdRef.current = activeId;
    for (const url of previewUrls.values()) URL.revokeObjectURL(url);
    previewUrls.clear();
    setUploads([]);
    setUploadError(null);
    if (!activeId) return () => { active = false; };

    listConversationUploads(activeId)
      .then(async (items) => {
        const withPreviews = [];
        for (const item of items) {
          if (!item.contentType?.startsWith('image/')) {
            withPreviews.push(item);
            continue;
          }
          const blob = await downloadConversationFile(activeId, item.id);
          const previewUrl = URL.createObjectURL(blob);
          previewUrlsRef.current.set(item.id, previewUrl);
          withPreviews.push({ ...item, previewUrl });
        }
        if (
          active
          && uploadsConversationIdRef.current === activeId
          && revision === uploadRevisionRef.current
        ) {
          setUploads(withPreviews);
        }
      })
      .catch((caught) => {
        if (active) {
          setUploadError(caught.message || 'Could not load conversation files.');
        }
      });
    return () => {
      active = false;
      for (const url of previewUrls.values()) URL.revokeObjectURL(url);
      previewUrls.clear();
    };
  }, [activeId]);

  async function handleUploadFiles(files) {
    setUploadError(null);
    const invalidFile = files.find((file) => {
      const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
      return !SUPPORTED_FILE_TYPES.get(extension)?.includes(file.type)
        || file.size === 0
        || file.size > MAX_UPLOAD_SIZE_BYTES;
    });
    if (invalidFile) {
      setUploadError(
        invalidFile.size > MAX_UPLOAD_SIZE_BYTES
          ? `${invalidFile.name} exceeds the 10 MB per-file limit.`
          : `The type or contents of ${invalidFile.name} are not supported.`,
      );
      return;
    }
    if (uploads.length + files.length > MAX_FILES_PER_MESSAGE) {
      setUploadError(`A conversation can have at most ${MAX_FILES_PER_MESSAGE} attached files.`);
      return;
    }
    const currentImageBytes = uploads
      .filter((upload) => upload.contentType?.startsWith('image/'))
      .reduce((total, upload) => total + upload.size, 0);
    const selectedImageBytes = files
      .filter((file) => file.type.startsWith('image/'))
      .reduce((total, file) => total + file.size, 0);
    if (currentImageBytes + selectedImageBytes > MAX_IMAGE_BYTES_PER_MESSAGE) {
      setUploadError('Attached images cannot exceed 20 MB combined.');
      return;
    }

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
        setUploadProgress({ name: file.name, percent: 0 });
        const upload = await uploadConversationFile(conversationId, file, {
          onProgress: (percent) => setUploadProgress({ name: file.name, percent }),
        });
        if (activeConversationIdRef.current === conversationId) {
          uploadRevisionRef.current += 1;
          const previewUrl = file.type.startsWith('image/')
            ? URL.createObjectURL(file)
            : undefined;
          if (previewUrl) previewUrlsRef.current.set(upload.id, previewUrl);
          setUploads((current) => [
            ...current,
            { ...upload, ...(previewUrl ? { previewUrl } : {}) },
          ]);
        }
      }
    } catch (caught) {
      setUploadError(caught.message || 'Could not upload the selected file.');
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
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
      const previewUrl = previewUrlsRef.current.get(upload.id);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrlsRef.current.delete(upload.id);
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

  async function handleThemeChange(nextTheme) {
    const saved = await updatePreference({ theme: nextTheme });
    if (saved) setPreference(nextTheme);
  }

  function handleThemeToggle() {
    void handleThemeChange(theme === 'dark' ? 'light' : 'dark');
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
          showArchived={showArchived}
          onSelect={handleSelectConversation}
          onNewChat={handleNewChat}
          onDelete={deleteConversation}
          onRename={renameConversation}
          onArchive={archiveConversation}
          onUnarchive={unarchiveConversation}
          onToggleArchived={toggleShowArchived}
          onClose={() => setIsSidebarOpen(false)}
          onOpenSettings={() => setIsSettingsOpen(true)}
        />
      }
      header={
        <ChatHeader
          title={activeConversation?.title ?? 'New chat'}
          theme={theme}
          onToggleTheme={handleThemeToggle}
          onOpenSidebar={() => setIsSidebarOpen(true)}
          models={modelCatalog.models}
          selectedModelId={selectedModelId}
          onModelChange={(modelId) => updatePreference({ selectedModelId: modelId })}
        />
      }
    >
      {hasMessages ? (
        <MessageList
          messages={messages}
          isPending={isPending}
          toolStatus={toolStatus}
          onRegenerate={regenerate}
          onEditMessage={editAndResend}
        />
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
        uploadProgress={uploadProgress}
        onUploadFiles={handleUploadFiles}
        onDownloadUpload={handleDownloadUpload}
        onDeleteUpload={handleDeleteUpload}
        uploadError={uploadError}
        onDismissUploadError={() => setUploadError(null)}
        supportsVision={selectedModel?.supportsVision}
        imageMimeTypes={selectedModel?.imageMimeTypes}
      />

      <SettingsPanel
        open={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        themePreference={preference}
        onThemeChange={handleThemeChange}
        models={modelCatalog.models}
        selectedModelId={selectedModelId}
        onModelChange={(modelId) => updatePreference({ selectedModelId: modelId })}
        modelError={modelCatalogError}
        displayName={preferences.displayName}
        onDisplayNameChange={() => {}}
        onDisplayNameSave={(displayName) => updatePreference({ displayName })}
        isLoadingSettings={preferencesLoading}
        isSavingSettings={preferencesSaving}
        settingsError={preferencesError}
        onClearHistory={handleClearHistory}
      />
    </AppShell>
  );
}

export default ChatPage;
