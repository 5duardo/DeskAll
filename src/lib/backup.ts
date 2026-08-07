import type { ClipboardEntry, ShortcutItem, ThemeMode } from "../types";

export const BACKUP_FORMAT = "deskall-backup" as const;
export const BACKUP_VERSION = 1;

export interface DeskAllBackup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: number;
  appVersion?: string;
  data: {
    shortcuts: ShortcutItem[];
    clipboard?: ClipboardEntry[];
    theme?: ThemeMode;
    githubRepo?: string;
  };
}

export function buildBackup(input: {
  shortcuts: ShortcutItem[];
  clipboard?: ClipboardEntry[];
  theme?: ThemeMode;
  githubRepo?: string;
  appVersion?: string;
}): DeskAllBackup {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    appVersion: input.appVersion,
    data: {
      shortcuts: input.shortcuts,
      clipboard: input.clipboard ?? [],
      theme: input.theme,
      githubRepo: input.githubRepo,
    },
  };
}

export function parseBackup(raw: string): DeskAllBackup {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("El archivo no es un JSON válido");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Copia de seguridad inválida");
  }
  const obj = parsed as Record<string, unknown>;
  if (obj.format !== BACKUP_FORMAT) {
    throw new Error("Este archivo no es una copia de DeskAll");
  }
  const data = obj.data;
  if (!data || typeof data !== "object") {
    throw new Error("La copia no contiene datos");
  }
  const d = data as Record<string, unknown>;
  if (!Array.isArray(d.shortcuts)) {
    throw new Error("La copia no incluye accesos del escritorio");
  }
  return {
    format: BACKUP_FORMAT,
    version: typeof obj.version === "number" ? obj.version : 1,
    exportedAt: typeof obj.exportedAt === "number" ? obj.exportedAt : Date.now(),
    appVersion: typeof obj.appVersion === "string" ? obj.appVersion : undefined,
    data: {
      shortcuts: d.shortcuts as ShortcutItem[],
      clipboard: Array.isArray(d.clipboard)
        ? (d.clipboard as ClipboardEntry[])
        : [],
      theme: d.theme as ThemeMode | undefined,
      githubRepo: typeof d.githubRepo === "string" ? d.githubRepo : undefined,
    },
  };
}

export function backupFileName(): string {
  const d = new Date();
  const stamp = [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
  return `deskall-backup-${stamp}.json`;
}
