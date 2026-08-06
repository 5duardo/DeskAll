import { invoke } from "@tauri-apps/api/core";
import type { ClipboardKind, PathInfo } from "../types";

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

export async function launchItem(target: string): Promise<void> {
  await invoke("launch_item", { target });
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
