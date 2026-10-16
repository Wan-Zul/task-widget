import type { View } from "../db/tasks";

const VIEWS: { id: View; label: string }[] = [
  { id: "all", label: "All" },
  { id: "done", label: "Done" },
];

interface Props {
  view: View;
  onChange: (v: View) => void;
}

export function ViewTabs({ view, onChange }: Props) {
  return (
    <nav className="tabs" role="tablist">
      {VIEWS.map((v) => (
        <button
          key={v.id}
          role="tab"
          aria-selected={view === v.id}
          className={view === v.id ? "tab active" : "tab"}
          onClick={() => onChange(v.id)}
        >
          {v.label}
        </button>
      ))}
    </nav>
  );
}
