import { useEffect } from 'react';
import { Button, IconButton } from '../ui/Button.jsx';
import { Icon } from '../ui/Icon.jsx';
import { THEME_PREFERENCES } from '../../hooks/useTheme.js';
import './SettingsPanel.css';

const THEME_ICONS = { system: 'monitor', light: 'sun', dark: 'moon' };

/**
 * Settings dialog: theme, display name, and history management.
 *
 * Rendered only while open, with Escape and backdrop-click both closing it, so
 * it never becomes a trap. The theme choice is the full three-way preference —
 * "system" included — while the header toggle stays a two-way flip, because
 * choosing "follow my OS" is a deliberate decision, not a cycle.
 */
export function SettingsPanel({
  open = false,
  onClose,
  themePreference,
  onThemeChange,
  displayName,
  onDisplayNameChange,
  onClearHistory,
}) {
  useEffect(() => {
    if (!open) return undefined;

    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose?.();
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="settings-overlay"
      role="presentation"
      onClick={() => onClose?.()}
    >
      <div
        className="settings"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="settings__header">
          <h2 className="settings__title" id="settings-title">
            Settings
          </h2>
          <IconButton icon="close" label="Close settings" onClick={() => onClose?.()} />
        </header>

        <section className="settings__section">
          <h3 className="settings__section-title">Appearance</h3>
          <div className="settings__theme" role="group" aria-label="Theme">
            {THEME_PREFERENCES.map(({ value, label }) => (
              <button
                type="button"
                key={value}
                className={`settings__theme-option${
                  themePreference === value ? ' settings__theme-option--active' : ''
                }`}
                aria-pressed={themePreference === value}
                onClick={() => onThemeChange?.(value)}
              >
                <Icon name={THEME_ICONS[value]} size={16} />
                {label}
              </button>
            ))}
          </div>
        </section>

        <section className="settings__section">
          <h3 className="settings__section-title">Profile</h3>
          <label className="settings__label" htmlFor="settings-display-name">
            Display name
          </label>
          <input
            id="settings-display-name"
            className="settings__input"
            type="text"
            maxLength={40}
            autoComplete="off"
            value={displayName}
            onChange={(event) => onDisplayNameChange?.(event.target.value)}
          />
        </section>

        <section className="settings__section">
          <h3 className="settings__section-title">History</h3>
          <p className="settings__description">
            Conversations are saved to your account and available when you sign in.
          </p>
          <Button variant="danger" onClick={() => onClearHistory?.()}>
            <Icon name="trash" size={16} />
            Clear all conversations
          </Button>
        </section>

        <footer className="settings__footer">
          <Button variant="primary" onClick={() => onClose?.()}>
            Done
          </Button>
        </footer>
      </div>
    </div>
  );
}

export default SettingsPanel;
