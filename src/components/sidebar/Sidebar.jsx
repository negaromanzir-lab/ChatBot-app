import { Button, IconButton } from '../ui/Button.jsx';
import { Icon } from '../ui/Icon.jsx';
import { Avatar } from '../message/Avatar.jsx';
import { formatRelativeDay, formatRelativeTime } from '../../utils/date.js';
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
  onSelect,
  onNewChat,
  onDelete,
  onClose,
  onOpenSettings,
}) {
  const groups = groupConversations(conversations);

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
        </Button>
      </div>

      <nav className="sidebar__history" aria-label="Conversation history">
        {groups.length === 0 ? (
          <p className="sidebar__empty">No conversations yet.</p>
        ) : (
          groups.map((group) => (
            <div className="sidebar__group" key={group.label}>
              <h2 className="sidebar__group-label">{group.label}</h2>
              <ul className="sidebar__list">
                {group.items.map((conversation) => {
                  const isActive = conversation.id === activeId;

                  return (
                    <li
                      className={`sidebar__row${isActive ? ' sidebar__row--active' : ''}`}
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
          <Avatar sender="user" size="sm" />
          <span className="sidebar__profile-name">{displayName}</span>
        </div>
        <IconButton icon="settings" label="Settings" onClick={onOpenSettings} />
      </div>
    </aside>
  );
}

export default Sidebar;
