interface Props {
  alwaysOnTop: boolean;
  onAlwaysOnTop: (on: boolean) => void;
  onClose: () => void;
}

export function Settings(p: Props) {
  return (
    <section className="settings">
      <h2>Settings</h2>
      <label className="setting-row">
        <span>Always on top</span>
        <input type="checkbox" checked={p.alwaysOnTop} onChange={(e) => p.onAlwaysOnTop(e.target.checked)} />
      </label>
      <button className="link-btn" onClick={p.onClose}>
        ← Back to tasks
      </button>
    </section>
  );
}
