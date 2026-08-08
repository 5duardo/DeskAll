import { isTauri } from "@tauri-apps/api/core";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export type BootUpdatePhase =
  | "checking"
  | "downloading"
  | "installing"
  | "error";

export interface BootUpdateStatus {
  phase: BootUpdatePhase;
  version?: string;
  message?: string;
}

/**
 * Check for a signed update on startup, download and install it, then relaunch.
 * Returns true when the app is about to restart.
 */
export async function runBootUpdate(
  onStatus: (status: BootUpdateStatus) => void,
): Promise<boolean> {
  if (!isTauri()) return false;

  try {
    onStatus({ phase: "checking" });
    const update = await check();
    if (!update) return false;

    onStatus({ phase: "downloading", version: update.version });
    await update.downloadAndInstall();

    onStatus({ phase: "installing", version: update.version });
    await relaunch();
    return true;
  } catch (err) {
    onStatus({
      phase: "error",
      message: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}
