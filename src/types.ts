export type ItemKind = "app" | "game" | "folder" | "file" | "url";

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

export type ViewMode = "desktop" | "clipboard" | "settings";

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
