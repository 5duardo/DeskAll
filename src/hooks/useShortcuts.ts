import { useCallback, useEffect, useRef, useState } from "react";
import { LazyStore } from "@tauri-apps/plugin-store";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { ItemKind, ShortcutItem } from "../types";
import { ACCENT_COLORS } from "../types";
import {
  createId,
  extractFileIcon,
  getLibraryDir,
  getPathInfo,
  importToLibrary,
} from "../lib/tauri";
import { fitIconDataUrl } from "../lib/fitIcon";

const store = new LazyStore("deskall.json");

async function extractFittedIcon(path: string): Promise<string | null> {
  try {
    const raw = await extractFileIcon(path);
    if (!raw) return null;
    try {
      return await fitIconDataUrl(raw, 192);
    } catch {
      return raw;
    }
  } catch {
    return null;
  }
}

function isHttpUrl(path: string) {
  return /^https?:\/\//i.test(path);
}

function inLibrary(path: string, libraryDir: string) {
  const a = path.replace(/\//g, "\\").toLowerCase();
  const b = libraryDir.replace(/\//g, "\\").toLowerCase().replace(/\\+$/, "");
  return a === b || a.startsWith(`${b}\\`);
}

type ActiveSession = {
  id: string;
  /** Wall-clock when current unflushed segment started */
  segmentStart: number;
};

export function useShortcuts() {
  const [items, setItems] = useState<ShortcutItem[]>([]);
  const [ready, setReady] = useState(false);
  const [copying, setCopying] = useState<string | null>(null);
  const [activeUsageId, setActiveUsageId] = useState<string | null>(null);
  const [activeSegmentStart, setActiveSegmentStart] = useState<number | null>(
    null,
  );
  const sessionRef = useRef<ActiveSession | null>(null);
  const itemsRef = useRef<ShortcutItem[]>([]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const persist = useCallback(async (next: ShortcutItem[]) => {
    itemsRef.current = next;
    setItems(next);
    await store.set("shortcuts", next);
    await store.save();
  }, []);

  const flushSession = useCallback(
    (end: boolean) => {
      const session = sessionRef.current;
      if (!session) return;

      const now = Date.now();
      const delta = Math.max(0, now - session.segmentStart);
      if (delta < 500 && !end) {
        session.segmentStart = now;
        return;
      }

      const next = itemsRef.current.map((i) =>
        i.id === session.id
          ? { ...i, usageMs: (i.usageMs ?? 0) + delta }
          : i,
      );
      itemsRef.current = next;
      setItems(next);
      void store.set("shortcuts", next).then(() => store.save());

      if (end) {
        sessionRef.current = null;
        setActiveUsageId(null);
        setActiveSegmentStart(null);
      } else {
        session.segmentStart = now;
        setActiveSegmentStart(now);
      }
    },
    [],
  );

  const endUsageSession = useCallback(() => {
    flushSession(true);
  }, [flushSession]);

  const startUsageSession = useCallback(
    (id: string) => {
      if (sessionRef.current?.id === id) {
        // Already tracking this one — keep going
        return;
      }
      flushSession(true);
      const now = Date.now();
      sessionRef.current = { id, segmentStart: now };
      setActiveUsageId(id);
      setActiveSegmentStart(now);

      const next = itemsRef.current.map((i) =>
        i.id === id
          ? {
              ...i,
              launchCount: (i.launchCount ?? 0) + 1,
              lastUsedAt: now,
            }
          : i,
      );
      itemsRef.current = next;
      setItems(next);
      void store.set("shortcuts", next).then(() => store.save());
    },
    [flushSession],
  );

  // Periodic flush while a session is active
  useEffect(() => {
    if (!activeUsageId) return;
    const id = window.setInterval(() => flushSession(false), 15_000);
    return () => window.clearInterval(id);
  }, [activeUsageId, flushSession]);

  // End session when DeskAll regains focus after being away (user came back)
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let blurredAt: number | null = null;

    void getCurrentWindow()
      .onFocusChanged(({ payload: focused }) => {
        if (!focused) {
          blurredAt = Date.now();
          return;
        }
        if (blurredAt && Date.now() - blurredAt > 1500) {
          endUsageSession();
        }
        blurredAt = null;
      })
      .then((fn) => {
        unlisten = fn;
      });

    const onUnload = () => endUsageSession();
    window.addEventListener("beforeunload", onUnload);

    return () => {
      unlisten?.();
      window.removeEventListener("beforeunload", onUnload);
      endUsageSession();
    };
  }, [endUsageSession]);

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

      let next = [...saved];
      let changed = false;
      for (const item of saved) {
        if (isHttpUrl(item.path) || item.kind === "url") {
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
          if (!info.exists) continue;
          setCopying(
            info.isDir
              ? `Copiando carpeta «${info.name}»…`
              : `Copiando «${info.name}»…`,
          );
          const libraryPath = await importToLibrary(
            item.path,
            info.onDesktop && info.isFile,
          );
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
          /* broken */
        } finally {
          if (!cancelled) setCopying(null);
        }
      }

      if (cancelled) return;
      setItems(next);
      setReady(true);
      if (changed) {
        await store.set("shortcuts", next);
        await store.save();
      }

      let withIcons = [...next];
      let iconChanged = false;
      for (const item of withIcons) {
        if (item.isGroup || item.path.startsWith("deskall://")) continue;
        try {
          const icon = await extractFittedIcon(item.path);
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
    async (
      path: string,
      forcedKind?: ItemKind,
      customName?: string,
      parentId?: string | null,
    ) => {
      const info = await getPathInfo(path);
      const kind = (forcedKind ?? (info.kind as ItemKind)) || "file";
      const items = itemsRef.current;

      let finalPath = path;
      const shouldCopy =
        info.exists && !isHttpUrl(path) && kind !== "url";

      if (shouldCopy) {
        const label = info.isDir
          ? `Copiando carpeta «${info.name}»…`
          : `Copiando «${info.name}»…`;
        setCopying(label);
        try {
          finalPath = await importToLibrary(
            path,
            info.onDesktop && info.isFile,
          );
        } finally {
          setCopying(null);
        }
      }

      const existing = items.find(
        (i) =>
          i.path.toLowerCase() === finalPath.toLowerCase() ||
          i.path.toLowerCase() === path.toLowerCase(),
      );
      if (existing) {
        if (existing.path.toLowerCase() !== finalPath.toLowerCase()) {
          const iconDataUrl =
            (await extractFittedIcon(finalPath)) ?? existing.iconDataUrl;
          const updated: ShortcutItem = {
            ...existing,
            path: finalPath,
            onDesktop: false,
            iconDataUrl,
            parentId:
              parentId !== undefined ? parentId : (existing.parentId ?? null),
          };
          await persist(
            items.map((i) => (i.id === existing.id ? updated : i)),
          );
          return updated;
        }
        if (parentId !== undefined && existing.parentId !== parentId) {
          const updated = { ...existing, parentId, onDesktop: false };
          await persist(
            items.map((i) => (i.id === existing.id ? updated : i)),
          );
          return updated;
        }
        return { ...existing, onDesktop: false };
      }

      const iconDataUrl = await extractFittedIcon(finalPath);

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
        usageMs: 0,
        launchCount: 0,
        parentId: parentId ?? null,
      };
      await persist([...items, item]);
      return item;
    },
    [persist],
  );

  const addUrl = useCallback(
    async (url: string, name?: string, parentId?: string | null) => {
      const items = itemsRef.current;
      const item: ShortcutItem = {
        id: createId(),
        name: name?.trim() || url.replace(/^https?:\/\//, "").split("/")[0],
        path: url,
        kind: "url",
        color: ACCENT_COLORS[items.length % ACCENT_COLORS.length],
        createdAt: Date.now(),
        onDesktop: false,
        iconDataUrl: null,
        usageMs: 0,
        launchCount: 0,
        parentId: parentId ?? null,
      };
      await persist([...items, item]);
      return item;
    },
    [persist],
  );

  const addGroup = useCallback(
    async (name: string, parentId?: string | null) => {
      const items = itemsRef.current;
      const trimmed = name.trim() || "Nueva carpeta";
      const id = createId();
      const item: ShortcutItem = {
        id,
        name: trimmed,
        path: `deskall://group/${id}`,
        kind: "folder",
        color: ACCENT_COLORS[items.length % ACCENT_COLORS.length],
        createdAt: Date.now(),
        onDesktop: false,
        iconDataUrl: null,
        usageMs: 0,
        launchCount: 0,
        isGroup: true,
        parentId: parentId ?? null,
      };
      await persist([...items, item]);
      return item;
    },
    [persist],
  );

  const moveToFolder = useCallback(
    async (id: string, parentId: string | null) => {
      const items = itemsRef.current;
      const target = items.find((i) => i.id === id);
      if (!target || target.isGroup) return;
      if (parentId && !items.some((i) => i.id === parentId && i.isGroup)) {
        return;
      }
      await persist(
        items.map((i) => (i.id === id ? { ...i, parentId } : i)),
      );
    },
    [persist],
  );

  const rename = useCallback(
    async (id: string, name: string) => {
      const items = itemsRef.current;
      await persist(
        items.map((i) =>
          i.id === id ? { ...i, name: name.trim() || i.name } : i,
        ),
      );
    },
    [persist],
  );

  const setIcon = useCallback(
    async (id: string, iconDataUrl: string | null) => {
      const items = itemsRef.current;
      let fitted = iconDataUrl;
      if (fitted) {
        try {
          fitted = await fitIconDataUrl(fitted, 192);
        } catch {
          /* keep */
        }
      }
      await persist(
        items.map((i) => (i.id === id ? { ...i, iconDataUrl: fitted } : i)),
      );
    },
    [persist],
  );

  const setKind = useCallback(
    async (id: string, kind: ItemKind) => {
      const items = itemsRef.current;
      await persist(items.map((i) => (i.id === id ? { ...i, kind } : i)));
    },
    [persist],
  );

  const remove = useCallback(
    async (id: string) => {
      if (sessionRef.current?.id === id) endUsageSession();
      const items = itemsRef.current;
      const target = items.find((i) => i.id === id);
      const parentOfRemoved = target?.parentId ?? null;
      await persist(
        items
          .filter((i) => i.id !== id)
          .map((i) =>
            i.parentId === id ? { ...i, parentId: parentOfRemoved } : i,
          ),
      );
    },
    [persist, endUsageSession],
  );

  const reorder = useCallback(
    async (fromId: string, toId: string) => {
      const items = itemsRef.current;
      const from = items.findIndex((i) => i.id === fromId);
      const to = items.findIndex((i) => i.id === toId);
      if (from < 0 || to < 0 || from === to) return;
      const next = [...items];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      await persist(next);
    },
    [persist],
  );

  const resetUsage = useCallback(
    async (id?: string) => {
      if (id && sessionRef.current?.id === id) endUsageSession();
      if (!id) endUsageSession();
      const items = itemsRef.current;
      await persist(
        items.map((i) =>
          !id || i.id === id
            ? { ...i, usageMs: 0, launchCount: 0, lastUsedAt: undefined }
            : i,
        ),
      );
    },
    [persist, endUsageSession],
  );

  return {
    items,
    ready,
    copying,
    activeUsageId,
    activeSegmentStart,
    addFromPath,
    addUrl,
    addGroup,
    moveToFolder,
    rename,
    setIcon,
    setKind,
    remove,
    reorder,
    startUsageSession,
    endUsageSession,
    resetUsage,
  };
}
