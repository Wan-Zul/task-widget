import { getSetting, setSetting, type Settings } from "../db/settings";

export type Theme = Settings["theme"];

export interface Appearance {
  theme: Theme;
  compact: boolean;
  /** First column of the calendar. */
  weekStart: Settings["week_start"];
}

/** "system" follows Windows via prefers-color-scheme; light/dark override it (see theme.css). */
function apply({ theme, compact }: Appearance) {
  const root = document.documentElement;
  if (theme === "system") delete root.dataset.theme;
  else root.dataset.theme = theme;
  if (compact) root.dataset.compact = "";
  else delete root.dataset.compact;
}

export async function loadAppearance(): Promise<Appearance> {
  const a: Appearance = {
    theme: (await getSetting("theme")) ?? "system",
    compact: (await getSetting("compact")) ?? false,
    weekStart: (await getSetting("week_start")) ?? "mon",
  };
  apply(a);
  return a;
}

export async function saveAppearance(a: Appearance): Promise<void> {
  apply(a);
  await setSetting("theme", a.theme);
  await setSetting("compact", a.compact);
  await setSetting("week_start", a.weekStart);
}
