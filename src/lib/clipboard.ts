/**
 * Copy text to the clipboard. Returns whether it succeeded so callers can show
 * feedback. Never throws; an unavailable Clipboard API (insecure context, denied
 * permission, etc.) resolves to `false`.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard) {
      return false;
    }

    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
