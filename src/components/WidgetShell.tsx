import type { ReactNode } from "react";
import type { TasksApi } from "../hooks/useTasks";
import { DragArea } from "./DragArea";
import { Header } from "./Header";
import { TaskPane } from "./TaskPane";

interface Props {
  api: TasksApi;
  alwaysOnTop: boolean;
  onToggleAlwaysOnTop: () => void;
  onHide: () => void;
  error: string | null;
  onDismissError: () => void;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  settings: ReactNode;
}

/** Floating window layout: a panel with a title bar. */
export function WidgetShell(p: Props) {
  return (
    <div className="app">
      <Header
        alwaysOnTop={p.alwaysOnTop}
        settingsOpen={p.settingsOpen}
        onToggleAlwaysOnTop={p.onToggleAlwaysOnTop}
        onToggleSettings={() => p.setSettingsOpen(!p.settingsOpen)}
        onHide={p.onHide}
      />
      {p.error && (
        <div className="error" role="alert" onClick={p.onDismissError}>
          {p.error}
        </div>
      )}
      {p.settingsOpen ? (
        p.settings
      ) : (
        <DragArea>
          <TaskPane api={p.api} />
        </DragArea>
      )}
    </div>
  );
}
