// Native dialogs (save/open/confirm) take focus from the widget. The notch folds itself
// when it loses focus, so it checks this first and stays open while a dialog is up.

let open = 0;

export const dialogOpen = () => open > 0;

export async function withDialog<T>(fn: () => Promise<T>): Promise<T> {
  open++;
  try {
    return await fn();
  } finally {
    open--;
  }
}
