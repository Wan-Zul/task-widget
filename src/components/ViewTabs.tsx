import type { View } from "../db/tasks";

export interface Tab {
  id: View;
  label: string;
}

export const LIST_TABS: Tab[] = [
  { id: "today", label: "Today" },
  { id: "upcoming", label: "Upcoming" },
  { id: "all", label: "All" },
  { id: "done", label: "Done" },
];

interface Props {
  tabs?: Tab[];
  view: View;
  onChange: (v: View) => void;
}

export function ViewTabs({ tabs = LIST_TABS, view, onChange }: Props) {
  return (
    <nav className="tabs" role="tablist">
      {tabs.map((v) => (
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
