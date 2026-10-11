import { IconButton } from '../ui/Button.jsx';
import './ChatHeader.css';

/**
 * Top chrome of the main pane.
 *
 * The menu button only exists below the sidebar breakpoint (it is hidden by
 * CSS on desktop), so it needs no viewport knowledge of its own. The theme
 * toggle is a one-click light/dark flip; the three-way preference including
 * "system" lives in Settings.
 */
export function ChatHeader({
  title,
  onOpenSidebar,
  theme = 'light',
  onToggleTheme,
  models = [],
  selectedModelId,
  onModelChange,
}) {
  return (
    <header className="chat-header">
      <IconButton
        icon="menu"
        label="Open sidebar"
        className="chat-header__menu"
        onClick={onOpenSidebar}
      />

      <div className="chat-header__identity">
        <h1 className="chat-header__title">{title}</h1>
        {models.length > 0 && (
          <label className="chat-header__model">
            <span className="visually-hidden">AI model</span>
            <select
              aria-label="AI model"
              value={selectedModelId ?? ''}
              onChange={(event) => onModelChange?.(event.target.value)}
            >
              {models.map((model) => (
                <option key={model.id} value={model.id}>{model.label}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      <IconButton
        icon={theme === 'dark' ? 'sun' : 'moon'}
        label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        onClick={onToggleTheme}
      />
    </header>
  );
}

export default ChatHeader;
