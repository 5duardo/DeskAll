import { useCallback, useEffect, useState } from "react";
import { LazyStore } from "@tauri-apps/plugin-store";
import type { ItemKind, ShortcutItem } from "../types";
import { ACCENT_COLORS } from "../types";
import {
  createId,
  extractFileIcon,
  getLibraryDir,
  getPathInfo,
  importToLibrary,
} from "../lib/tauri";

const store = new LazyStore("deskall.json");

function isHttpUrl(path: string) {
  return /^https?:\/\//i.test(path);
}

function inLibrary(path: string, libraryDir: string) {
  const a = path.replace(/\//g, "\\").toLowerCase();
  const b = libraryDir.replace(/\//g, "\\").toLowerCase().replace(/\\+$/, "");
  return a === b || a.startsWith(`${b}\\`);
}

export function useShortcuts() {
  const [items, setItems] = useState<ShortcutItem[]>([]);
  const [ready, setReady] = useState(false);

  const persist = useCallback(async (next: ShortcutItem[]) => {
    setItems(next);
    await store.set("shortcuts", next);
    await store.save();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = (await store.get<ShortcutItem[]>("shortcuts")) ?? [];
      if (cancelled) return;

      let libraryDir = "";
      try {
        libraryDir = await getLibraryDir();
      } catch {
        /* ignore */
      }

      // Migrate old entries: copy into library, drop Desktop dependency
      let next = [...saved];
      let changed = false;
      for (const item of saved) {
        if (
          isHttpUrl(item.path) ||
          item.kind === "folder" ||
          item.kind === "url"
        ) {
          if (item.onDesktop) {
            next = next.map((i) =>
              i.id === item.id ? { ...i, onDesktop: false } : i,
            );
            changed = true;
          }
          continue;
        }
        if (libraryDir && inLibrary(item.path, libraryDir)) {
          if (item.onDesktop) {
            next = next.map((i) =>
              i.id === item.id ? { ...i, onDesktop: false } : i,
            );
            changed = true;
          }
          continue;
        }
        try {
          const info = await getPathInfo(item.path);
          if (!info.exists || info.isDir) continue;
          // Copy to library; delete Desktop original if it was there
          const libraryPath = await importToLibrary(item.path, info.onDesktop);
          let iconDataUrl = item.iconDataUrl;
          try {
            iconDataUrl = await extractFileIcon(libraryPath);
          } catch {
            /* keep */
          }
          next = next.map((i) =>
            i.id === item.id
              ? { ...i, path: libraryPath, onDesktop: false, iconDataUrl }
              : i,
          );
          changed = true;
        } catch {
          /* broken path — leave until user re-adds */
        }
      }

      if (cancelled) return;
      setItems(next);
      setReady(true);
      if (changed) {
        await store.set("shortcuts", next);
        await store.save();
      }

      // Refresh icons from library paths
      let withIcons = [...next];
      let iconChanged = false;
      for (const item of withIcons) {
        try {
          const icon = await extractFileIcon(item.path);
          if (icon && icon !== item.iconDataUrl) {
            withIcons = withIcons.map((i) =>
              i.id === item.id ? { ...i, iconDataUrl: icon } : i,
            );
            iconChanged = true;
            if (!cancelled) setItems([...withIcons]);
          }
        } catch {
          /* ignore */
        }
      }
      if (!cancelled && iconChanged) {
        setItems(withIcons);
        await store.set("shortcuts", withIcons);
        await store.save();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const addFromPath = useCallback(
    async (path: string, forcedKind?: ItemKind, customName?: string) => {
      const info = await getPathInfo(path);
      const kind = (forcedKind ?? (info.kind as ItemKind)) || "file";

      // Folders & URLs: reference only. Everything else: ALWAYS library copy.
      // If it came from Desktop, delete the Desktop original after copying.
      let finalPath = path;
      const isFile =
        info.exists && !info.isDir && !isHttpUrl(path) && kind !== "url";

      if (isFile) {
        finalPath = await importToLibrary(path, info.onDesktop);
      }

      const existing = items.find(
        (i) =>
          i.path.toLowerCase() === finalPath.toLowerCase() ||
          i.path.toLowerCase() === path.toLowerCase(),
      );
      if (existing) {
        if (existing.path.toLowerCase() !== finalPath.toLowerCase()) {
          let iconDataUrl = existing.iconDataUrl;
          try {
            iconDataUrl = await extractFileIcon(finalPath);
          } catch {
            /* keep */
          }
          const updated: ShortcutItem = {
            ...existing,
            path: finalPath,
            onDesktop: false,
            iconDataUrl,
          };
          await persist(
            items.map((i) => (i.id === existing.id ? updated : i)),
          );
          return updated;
        }
        return { ...existing, onDesktop: false };
      }

      let iconDataUrl: string | null = null;
      try {
        iconDataUrl = await extractFileIcon(finalPath);
      } catch {
        iconDataUrl = null;
      }

      const item: ShortcutItem = {
        id: createId(),
        name: customName?.trim() || info.name || path,
        path: finalPath,
        kind: ["app", "game", "folder", "file", "url"].includes(kind)
          ? kind
          : "file",
        color: ACCENT_COLORS[items.length % ACCENT_COLORS.length],
        createdAt: Date.now(),
        onDesktop: false,
        iconDataUrl,
      };
      await persist([...items, item]);
      return item;
    },
    [items, persist],
  );

  const addUrl = useCallback(
    async (url: string, name?: string) => {
      const item: ShortcutItem = {
        id: createId(),
        name: name?.trim() || url.replace(/^https?:\/\//, "").split("/")[0],
        path: url,
        kind: "url",
        color: ACCENT_COLORS[items.length % ACCENT_COLORS.length],
        createdAt: Date.now(),
        onDesktop: false,
        iconDataUrl: null,
      };
      await persist([...items, item]);
      return item;
    },
    [items, persist],
  );

  const rename = useCallback(
    async (id: string, name: string) => {
      await persist(
        items.map((i) =>
          i.id === id ? { ...i, name: name.trim() || i.name } : i,
        ),
      );
    },
    [items, persist],
  );

  const setKind = useCallback(
    async (id: string, kind: ItemKind) => {
      await persist(items.map((i) => (i.id === id ? { ...i, kind } : i)));
    },
    [items, persist],
  );

  const remove = useCallback(
    async (id: string) => {
      await persist(items.filter((i) => i.id !== id));
    },
    [items, persist],
  );

  const reorder = useCallback(
    async (fromId: string, toId: string) => {
      const from = items.findIndex((i) => i.id === fromId);
      const to = items.findIndex((i) => i.id === toId);
      if (from < 0 || to < 0 || from === to) return;
      const next = [...items];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      await persist(next);
    },
    [items, persist],
  );

  return {
    items,
    ready,
    addFromPath,
    addUrl,
    rename,
    setKind,
    remove,
    reorder,
  };
}
