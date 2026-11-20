import { isTauri } from "@tauri-apps/api/core";
import { check, type Update } from "@tauri-apps/plugin-updater";

export type UpdateNotice = {
  currentVersion: string;
  version: string;
  date: string | null;
  notes: string | null;
  install: () => Promise<void>;
  close: () => Promise<void>;
};

export type UpdateCheckResult =
  | { status: "unsupported" }
  | { status: "current" }
  | { status: "available"; notice: UpdateNotice };

export async function checkForDesktopUpdate(
  checkUpdate: (options?: { timeout?: number }) => Promise<Update | null> = check,
  desktop = isTauri(),
): Promise<UpdateCheckResult> {
  if (!desktop) return { status: "unsupported" };

  const update = await checkUpdate({ timeout: 15_000 });
  if (!update) return { status: "current" };

  return { status: "available", notice: {
    currentVersion: update.currentVersion,
    version: update.version,
    date: update.date ?? null,
    notes: update.body ?? null,
    install: () => update.downloadAndInstall(),
    close: () => update.close(),
  } };
}
