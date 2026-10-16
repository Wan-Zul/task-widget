interface Props {
  alwaysOnTop: boolean;
  /** Docked: no dragging, and the pin is hidden because the panel is always on top. */
  docked: boolean;
  settingsOpen: boolean;
  onToggleAlwaysOnTop: () => void;
  onToggleSettings: () => void;
  onHide: () => void;
}

const PinIcon = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
    <path d="M9.5 1.5 14.5 6.5 12 7.5 9.5 10 9 13.5 2.5 7 6 6.5 8.5 4z M5 11 1.5 14.5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
  </svg>
);

const GearIcon = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
    <circle cx="8" cy="8" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
    <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
  </svg>
);

const CloseIcon = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
    <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

/** Title bar: the empty area drags the window (floating mode); buttons sit on the right. */
export function Header(p: Props) {
  const drag = p.docked ? {} : { "data-tauri-drag-region": true };
  return (
    <div className="titlebar" {...drag}>
      <span className="titlebar-title" {...drag}>
        Tasks
      </span>
      {!p.docked && (
        <button
          className={p.alwaysOnTop ? "icon-btn on" : "icon-btn"}
          title={p.alwaysOnTop ? "Always on top: on" : "Always on top: off"}
          aria-pressed={p.alwaysOnTop}
          onClick={p.onToggleAlwaysOnTop}
        >
          <PinIcon />
        </button>
      )}
      <button
        className={p.settingsOpen ? "icon-btn on" : "icon-btn"}
        title="Settings"
        aria-pressed={p.settingsOpen}
        onClick={p.onToggleSettings}
      >
        <GearIcon />
      </button>
      <button className="icon-btn" title="Hide to tray" onClick={p.onHide}>
        <CloseIcon />
      </button>
    </div>
  );
}
