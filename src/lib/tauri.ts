import { invoke, Channel } from "@tauri-apps/api/core";
import type { ClipboardKind, PathInfo, SystemInfo } from "../types";

export async function getPathInfo(path: string): Promise<PathInfo> {
  return invoke<PathInfo>("get_path_info", { path });
}

export async function getDesktopDir(): Promise<string> {
  return invoke<string>("get_desktop_dir");
}

export async function isOnDesktop(path: string): Promise<boolean> {
  return invoke<boolean>("is_on_desktop", { path });
}

export async function deleteDesktopItem(path: string): Promise<void> {
  await invoke("delete_desktop_item", { path });
}

/** Copy a shortcut/file into DeskAll's library folder. Returns the new path. */
export async function copyToLibrary(path: string): Promise<string> {
  return invoke<string>("copy_to_library", { path });
}

/** Copy into library; optionally delete the Desktop original afterward. */
export async function importToLibrary(
  path: string,
  deleteDesktopOriginal = false,
): Promise<string> {
  return invoke<string>("import_to_library", {
    path,
    deleteDesktopOriginal,
  });
}

/**
 * Copy from Desktop into library, then delete the Desktop original.
 * Returns the library path DeskAll should keep using.
 */
export async function moveDesktopToLibrary(path: string): Promise<string> {
  return invoke<string>("move_desktop_to_library", { path });
}

export async function getLibraryDir(): Promise<string> {
  return invoke<string>("get_library_dir");
}

export type DirEntryInfo = {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  modifiedMs: number | null;
  extension: string | null;
};

export type KnownFolder = {
  id: string;
  label: string;
  path: string;
};

export async function listKnownFolders(): Promise<KnownFolder[]> {
  return invoke<KnownFolder[]>("list_known_folders");
}

export async function listDirectory(path: string): Promise<DirEntryInfo[]> {
  return invoke<DirEntryInfo[]>("list_directory", { path });
}

export interface InstalledApp {
  name: string;
  path: string;
}

export type InstalledScanEvent =
  | { type: "batch"; data: InstalledApp[] }
  | { type: "done"; data: { total: number } };

/** Programs detected from Start Menu / Applications. */
export async function listInstalledApps(): Promise<InstalledApp[]> {
  return invoke<InstalledApp[]>("list_installed_apps");
}

/**
 * Stream installed apps in small batches.
 * `onBatch` is called repeatedly; resolves when the scan finishes.
 */
export async function scanInstalledApps(
  onBatch: (apps: InstalledApp[]) => void,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const onEvent = new Channel<InstalledScanEvent>();
    onEvent.onmessage = (msg) => {
      if (msg.type === "batch") {
        onBatch(msg.data);
      } else if (msg.type === "done") {
        resolve(msg.data.total);
      }
    };
    void invoke("scan_installed_apps", { onEvent }).catch(reject);
  });
}

export async function launchItem(target: string): Promise<void> {
  await invoke("launch_item", { target });
}

/** Subset of paths whose resolved exe is currently running. */
export async function whichAreRunning(paths: string[]): Promise<string[]> {
  if (paths.length === 0) return [];
  return invoke<string[]>("which_are_running", { paths });
}

export async function revealItem(path: string): Promise<void> {
  await invoke("reveal_item", { path });
}

/** Absolute path to the JSON store that persists clipboard history. */
export async function getClipboardStorePath(): Promise<string> {
  return invoke<string>("get_clipboard_store_path");
}

export async function getClipboardKindDir(
  kind: ClipboardKind | "all",
): Promise<string> {
  if (kind === "all") {
    const textDir = await invoke<string>("get_clipboard_kind_dir", {
      kind: "text",
    });
    const sep = textDir.includes("\\") ? "\\" : "/";
    const parts = textDir.split(/[/\\]/);
    parts.pop();
    return parts.join(sep);
  }
  return invoke<string>("get_clipboard_kind_dir", { kind });
}

export async function saveClipboardText(
  id: string,
  text: string,
): Promise<string> {
  return invoke<string>("save_clipboard_text", { id, text });
}

export async function saveClipboardImage(
  id: string,
  dataUrl: string,
): Promise<string> {
  return invoke<string>("save_clipboard_image", { id, dataUrl });
}

export async function deleteClipboardFile(path: string): Promise<void> {
  await invoke("delete_clipboard_file", { path });
}

/** Open the folder (or file) for a clipboard entry / kind. */
export async function openClipboardLocation(opts: {
  kind: ClipboardKind | "all";
  filePath?: string | null;
}): Promise<void> {
  if (opts.filePath) {
    await revealItem(opts.filePath);
    return;
  }
  const dir = await getClipboardKindDir(opts.kind);
  await revealItem(dir);
}

export async function extractFileIcon(path: string): Promise<string | null> {
  return invoke<string | null>("extract_file_icon", { path });
}

export async function getSystemInfo(): Promise<SystemInfo> {
  return invoke<SystemInfo>("get_system_info");
}

export type GameCoverResult = {
  id: string;
  label: string;
  previewUrl: string;
  fetchUrl: string;
  source: string;
};

/** Wikipedia covers (Epic-only games like Rocket League work here). */
export async function searchGameCovers(
  query: string,
  limit = 12,
  preferGame = true,
): Promise<GameCoverResult[]> {
  return invoke<GameCoverResult[]>("search_game_covers", {
    query,
    limit,
    preferGame,
  });
}

/** Download remote image as square PNG data URL (no CORS issues). */
export async function fetchRemoteImagePng(
  url: string,
  size = 192,
): Promise<string> {
  return invoke<string>("fetch_remote_image_png", { url, size });
}

/** All icon resources embedded in an exe/lnk/dll. */
export async function listFileIcons(path: string): Promise<string[]> {
  return invoke<string[]>("list_file_icons", { path });
}

export async function writeTextFile(path: string, contents: string): Promise<void> {
  await invoke("write_text_file", { path, contents });
}

export async function readTextFile(path: string): Promise<string> {
  return invoke<string>("read_text_file", { path });
}

export function createId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function truncate(text: string, max = 120): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max)}…`;
}

export function formatTime(ts: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "short",
  }).format(new Date(ts));
}
