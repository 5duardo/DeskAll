export type ItemKind = "app" | "game" | "folder" | "file" | "url";

/** Which desktop tab a DeskAll folder belongs to (folders are not shared). */
export type DeskTabId = "apps" | "games" | "files";

export interface ShortcutItem {
  id: string;
  name: string;
  path: string;
  kind: ItemKind;
  color: string;
  createdAt: number;
  /** True when the path lives on the OS Desktop */
  onDesktop?: boolean;
  /** Extracted system icon as PNG data URL */
  iconDataUrl?: string | null;
  /** User-chosen icon (online/upload/file pick) — do not re-extract on boot */
  iconCustom?: boolean;
  /** Total tracked usage time in milliseconds */
  usageMs?: number;
  /** How many times it was launched from DeskAll */
  launchCount?: number;
  /** Last launch timestamp */
  lastUsedAt?: number;
  /** True when an app/game path is no longer available on disk */
  missing?: boolean;
  /**
   * DeskAll category folder (not an OS path).
   * Children point here via parentId.
   */
  isGroup?: boolean;
  /** Parent category folder id; null/undefined = desktop root */
  parentId?: string | null;
  /** Tab that owns this folder (only for isGroup). Defaults to apps if missing. */
  groupTab?: DeskTabId;
  /** Favorite (used to group games) */
  favorite?: boolean;
}

export type ClipboardKind = "text" | "image";

export interface ClipboardEntry {
  id: string;
  kind: ClipboardKind;
  /** Plain text for text entries */
  text?: string;
  /** PNG data URL for image entries */
  imageDataUrl?: string;
  width?: number;
  height?: number;
  /** Absolute path to the saved .txt / image file on disk */
  filePath?: string | null;
  /** Dedup fingerprint */
  fingerprint: string;
  createdAt: number;
  pinned: boolean;
}

export interface PathInfo {
  exists: boolean;
  isDir: boolean;
  isFile: boolean;
  name: string;
  extension: string | null;
  kind: string;
  onDesktop: boolean;
}

export interface FileDetails {
  exists: boolean;
  sizeBytes: number;
  modifiedAt: number | null;
  createdAt: number | null;
  isDir: boolean;
  isFile: boolean;
  isSymlink: boolean;
  extension: string | null;
  parentDir: string;
}

export type ViewMode = "desktop" | "clipboard" | "pcinfo" | "settings" | "detail";

export interface CpuInfo {
  brand: string;
  frequencyMhz: number;
  physicalCores: number | null;
  logicalCores: number;
  usage: number;
}

export interface MemoryInfo {
  totalBytes: number;
  usedBytes: number;
  availableBytes: number;
  swapTotalBytes: number;
  swapUsedBytes: number;
}

export interface DiskInfo {
  name: string;
  mountPoint: string;
  fileSystem: string;
  totalBytes: number;
  availableBytes: number;
  isRemovable: boolean;
}

export interface SystemInfo {
  hostname: string;
  osName: string;
  osVersion: string;
  kernelVersion: string;
  arch: string;
  uptimeSecs: number;
  bootTimeSecs: number;
  cpu: CpuInfo;
  memory: MemoryInfo;
  disks: DiskInfo[];
}

export type ThemeMode = "light" | "dark" | "system";

export const KIND_LABELS: Record<ItemKind, string> = {
  app: "App",
  game: "Juego",
  folder: "Carpeta",
  file: "Archivo",
  url: "URL",
};

export const ACCENT_COLORS = [
  "#52525b",
  "#3f3f46",
  "#71717a",
  "#27272a",
  "#a1a1aa",
  "#57534e",
  "#44403c",
  "#78716c",
];
