import './AppShell.css';

/**
 * Two-pane application shell.
 *
 * On desktop the sidebar is a normal flex child; below the layout breakpoint
 * it becomes an off-canvas drawer that only exists visually when open. The
 * drawer state is lifted to the page, so this component stays declarative and
 * the caller decides what "open" means.
 *
 * `header` and `children` are rendered in the main pane: the header is fixed
 * chrome, while children are the scrolling chat region.
 */
export function AppShell({ sidebar, isSidebarOpen = false, onCloseSidebar, header, children }) {
  return (
    <div className="app-shell">
      <div
        className={`app-shell__sidebar${isSidebarOpen ? ' app-shell__sidebar--open' : ''}`}
        id="app-sidebar"
      >
        {sidebar}
      </div>

      {isSidebarOpen && (
        <button
          type="button"
          className="app-shell__backdrop"
          aria-label="Close sidebar"
          onClick={onCloseSidebar}
        />
      )}

      <div className="app-shell__main">
        {header}
        <div className="app-shell__content">{children}</div>
      </div>
    </div>
  );
}

export default AppShell;
