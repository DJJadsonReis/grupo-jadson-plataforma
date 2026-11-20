export type AppTheme = "dark" | "light";
export interface ShellPrefs { sidebarCollapsed: boolean; theme: AppTheme; }
export const SHELL_PREFS_KEY = "grupo-jadson.shell-prefs.v1";
export const DEFAULT_SHELL_PREFS: ShellPrefs = { sidebarCollapsed: false, theme: "dark" };

export function readShellPrefs(storage?: Pick<Storage, "getItem"> | null): ShellPrefs {
  try {
    const value = storage?.getItem(SHELL_PREFS_KEY);
    if (!value) return DEFAULT_SHELL_PREFS;
    const parsed = JSON.parse(value) as Partial<ShellPrefs>;
    return { sidebarCollapsed: parsed.sidebarCollapsed === true, theme: parsed.theme === "light" ? "light" : "dark" };
  } catch { return DEFAULT_SHELL_PREFS; }
}

export function writeShellPrefs(storage: Pick<Storage, "setItem"> | null | undefined, prefs: ShellPrefs): void {
  try { storage?.setItem(SHELL_PREFS_KEY, JSON.stringify(prefs)); } catch { /* preferência fica apenas em memória */ }
}
