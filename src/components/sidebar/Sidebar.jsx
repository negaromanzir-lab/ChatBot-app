import { Button, IconButton } from '../ui/Button.jsx';
import { Icon } from '../ui/Icon.jsx';
import { formatRelativeDay, formatRelativeTime } from '../../utils/date.js';
import { UserButton } from '@clerk/react';
import { useMemo, useState } from 'react';
import './Sidebar.css';

/**
 * Buckets conversations into day groups for the history list.
 *
 * The list arrives sorted newest-first from the caller, and grouping walks it
 * in order, so each conversation lands under its own last-updated day without a
 * second sort.
 */
function groupConversations(conversations) {
  const groups = [];

  for (const conversation of conversations) {
    const label = formatRelativeDay(conversation.updatedAt);
    const last = groups[groups.length - 1];

    if (last && last.label === label) {
      last.items.push(conversation);
    } else {
      groups.push({ label, items: [conversation] });
    }
  }

  return groups;
}

/**
 * Left navigation pane: brand, new-chat action, conversation history, and the
 * profile/settings footer.
 *
 * Delete is a separate control from the row button rather than something hidden
 * behind a context menu: history rows are the only place a conversation exists,
 * so the destructive action belongs exactly where the item is.
 */
export function Sidebar({
  conversations,
  activeId,
  displayName,
  showArchived,
  onSelect,
  onNewChat,
  onDelete,
  onRename,
  onArchive,
  onUnarchive,
  onToggleArchived,
  onClose,
  onOpenSettings,
}) {
  const [query, setQuery] = useState('');
  const filteredConversations = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return conversations;
    return conversations.filter(({ title }) => title.toLocaleLowerCase().includes(normalizedQuery));
  }, [conversations, query]);
  const groups = groupConversations(filteredConversations);

  return (
    <aside className="sidebar" aria-label="Sidebar">
      <div className="sidebar__header">
        <span className="sidebar__brand">
          <Icon name="assistant" size={18} />
          Chatbot
        </span>
        <IconButton
          icon="close"
          label="Close sidebar"
          className="sidebar__close"
          onClick={onClose}
        />
      </div>

      <div className="sidebar__new-chat">
        <Button variant="secondary" isFullWidth onClick={onNewChat}>
          <Icon name="plus" size={16} />
          New chat
          <kbd className="sidebar__shortcut" aria-hidden="true">Ctrl ⇧ O</kbd>
        </Button>
      </div>

      <label className="sidebar__search">
        <Icon name="search" size={16} />
        <span className="visually-hidden">Search conversations</span>
        <input
          id="conversation-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search conversations"
          autoComplete="off"
        />
        {!query && <kbd aria-hidden="true">Ctrl K</kbd>}
      </label>

      <div className="sidebar__filter">
        <button
          type="button"
          className="sidebar__filter-toggle"
          aria-pressed={showArchived}
          onClick={onToggleArchived}
        >
          <Icon name="archive" size={14} />
          {showArchived ? 'Hide archived' : 'Show archived'}
        </button>
      </div>

      <nav className="sidebar__history" aria-label="Conversation history">
        {groups.length === 0 ? (
          <p className="sidebar__empty">
            {query
              ? 'No conversations match your search.'
              : 'No conversations yet.'}
          </p>
        ) : (
          groups.map((group) => (
            <div className="sidebar__group" key={group.label}>
              <h2 className="sidebar__group-label">{group.label}</h2>
              <ul className="sidebar__list">
                {group.items.map((conversation) => {
                  const isActive = conversation.id === activeId;
                  const isArchived = Boolean(conversation.archivedAt);

                  return (
                    <li
                      className={`sidebar__row${isActive ? ' sidebar__row--active' : ''}${
                        isArchived ? ' sidebar__row--archived' : ''
                      }`}
                      key={conversation.id}
                    >
                      <button
                        type="button"
                        className="sidebar__row-button"
                        aria-current={isActive ? 'true' : undefined}
                        title={conversation.title}
                        onClick={() => onSelect(conversation.id)}
                      >
                        <Icon name="conversation" size={16} />
                        <span className="sidebar__row-title">{conversation.title}</span>
                        <span className="sidebar__row-time">
                          {formatRelativeTime(conversation.updatedAt)}
                        </span>
                      </button>

                      {!isArchived && (
                        <IconButton
                          icon="pencil"
                          label={`Rename conversation: ${conversation.title}`}
                          size="sm"
                          className="sidebar__row-rename"
                          onClick={() => {
                            const title = window.prompt('Rename conversation', conversation.title);
                            if (title?.trim()) onRename(conversation.id, title);
                          }}
                        />
                      )}

                      <IconButton
                        icon={isArchived ? 'unarchive' : 'archive'}
                        label={
                          isArchived
                            ? `Unarchive conversation: ${conversation.title}`
                            : `Archive conversation: ${conversation.title}`
                        }
                        size="sm"
                        className="sidebar__row-archive"
                        onClick={() =>
                          (isArchived ? onUnarchive : onArchive)(conversation.id)
                        }
                      />

                      <IconButton
                        icon="trash"
                        label={`Delete conversation: ${conversation.title}`}
                        size="sm"
                        className="sidebar__row-delete"
                        onClick={() => onDelete(conversation.id)}
                      />
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </nav>

      <div className="sidebar__footer">
        <div className="sidebar__profile" title={displayName}>
          <UserButton />
          <span className="sidebar__profile-name">{displayName}</span>
        </div>
        <IconButton
          icon="settings"
          label="Settings"
          title="Settings (Ctrl ,)"
          onClick={onOpenSettings}
        />
      </div>
    </aside>
  );
}

export default Sidebar;
