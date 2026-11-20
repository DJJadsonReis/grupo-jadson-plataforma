export type ShellShortcut = "new-chat" | "search" | "toggle-sidebar";
export interface ShortcutInput { key: string; ctrlKey: boolean; metaKey?: boolean; shiftKey?: boolean; altKey?: boolean; targetTag?: string | undefined; contentEditable?: boolean; }

/** Ctrl/Cmd+N e busca funcionam também enquanto um campo de texto tem foco. */
export function shellShortcut(input: ShortcutInput): ShellShortcut | null {
  if (!(input.ctrlKey || input.metaKey) || input.altKey || input.shiftKey) return null;
  const key = input.key.toLowerCase();
  if (key === "n") return "new-chat";
  if (key === "k") return "search";
  const typing = input.contentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes((input.targetTag ?? "").toUpperCase());
  return key === "b" && !typing ? "toggle-sidebar" : null;
}
