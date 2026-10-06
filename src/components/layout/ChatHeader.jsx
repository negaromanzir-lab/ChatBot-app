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
export function ChatHeader({ title, onOpenSidebar, theme = 'light', onToggleTheme }) {
  return (
    <header className="chat-header">
      <IconButton
        icon="menu"
        label="Open sidebar"
        className="chat-header__menu"
        onClick={onOpenSidebar}
      />

      <h1 className="chat-header__title">{title}</h1>

      <IconButton
        icon={theme === 'dark' ? 'sun' : 'moon'}
        label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        onClick={onToggleTheme}
      />
    </header>
  );
}

export default ChatHeader;
