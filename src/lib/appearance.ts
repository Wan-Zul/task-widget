import { getSetting, setSetting, type Settings } from "../db/settings";

export type Theme = Settings["theme"];

export interface Appearance {
  theme: Theme;
  compact: boolean;
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
  };
  apply(a);
  return a;
}

export async function saveAppearance(a: Appearance): Promise<void> {
  apply(a);
  await setSetting("theme", a.theme);
  await setSetting("compact", a.compact);
}
