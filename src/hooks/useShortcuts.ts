import { useCallback, useEffect, useRef, useState } from "react";
import type { DeskTabId, ItemKind, ShortcutItem } from "../types";
import { ACCENT_COLORS } from "../types";
import {
  createId,
  extractFileIcon,
  getLibraryDir,
  getPathInfo,
  importToLibrary,
  whichAreRunning,
} from "../lib/tauri";
import { fitIconDataUrl, prepareCustomAvatar } from "../lib/fitIcon";
import { store } from "../lib/store";

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

function isLaunchable(item: ShortcutItem) {
  if (item.isGroup) return false;
  if (item.kind === "folder" || item.kind === "url" || item.kind === "file") {
    return false;
  }
  if (!item.path || isHttpUrl(item.path)) return false;
  return true;
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
  const [runningIds, setRunningIds] = useState<string[]>([]);
  const [activeSegmentStart, setActiveSegmentStart] = useState<number | null>(
    null,
  );
  const sessionRef = useRef<ActiveSession | null>(null);
  const itemsRef = useRef<ShortcutItem[]>([]);
  /** Grace window after launch before process must be visible */
  const launchGraceRef = useRef<Map<string, number>>(new Map());

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
      launchGraceRef.current.set(id, now + 12_000);
      setRunningIds((prev) => (prev.includes(id) ? prev : [...prev, id]));

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

  // Poll OS processes to mark open apps / games
  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    let inFlight = false;

    const poll = async () => {
      if (inFlight || document.hidden) return;
      inFlight = true;
      const list = itemsRef.current.filter(isLaunchable);
      const pathToIds = new Map<string, string[]>();
      for (const item of list) {
        const key = item.path;
        const ids = pathToIds.get(key);
        if (ids) ids.push(item.id);
        else pathToIds.set(key, [item.id]);
      }

      let runningPaths: string[] = [];
      try {
        runningPaths = await whichAreRunning([...pathToIds.keys()]);
      } catch {
        runningPaths = [];
      }
      if (cancelled) {
        inFlight = false;
        return;
      }

      const now = Date.now();
      const detected = new Set<string>();
      for (const path of runningPaths) {
        for (const id of pathToIds.get(path) ?? []) {
          detected.add(id);
        }
      }

      // Keep recently launched items visible while process starts
      for (const [id, until] of [...launchGraceRef.current.entries()]) {
        if (until > now) detected.add(id);
        else launchGraceRef.current.delete(id);
      }

      const nextIds = [...detected];
      setRunningIds((prev) => {
        if (
          prev.length === nextIds.length &&
          prev.every((id, i) => id === nextIds[i])
        ) {
          return prev;
        }
        return nextIds;
      });

      // End usage session when that process is no longer running
      const session = sessionRef.current;
      if (session && !detected.has(session.id)) {
        const graceUntil = launchGraceRef.current.get(session.id) ?? 0;
        if (graceUntil <= now) {
          endUsageSession();
        }
      }
      inFlight = false;
    };

    void poll();
    timer = window.setInterval(() => void poll(), 2500);

    const onUnload = () => endUsageSession();
    window.addEventListener("beforeunload", onUnload);

    return () => {
      cancelled = true;
      inFlight = false;
      if (timer) window.clearInterval(timer);
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

      // Migrate folders: assign groupTab (default apps) so tabs stay separate
      for (const item of next) {
        if (item.isGroup && !item.groupTab) {
          next = next.map((i) =>
            i.id === item.id ? { ...i, groupTab: "apps" as DeskTabId } : i,
          );
          changed = true;
        }
      }

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
          if (!item.iconCustom) {
            try {
              iconDataUrl =
                (await extractFittedIcon(libraryPath)) ?? iconDataUrl;
            } catch {
              /* keep */
            }
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

      // Icon extraction is intentionally after ready: it must not block startup.
      void (async () => {
        let withIcons = [...next];
        const pending = withIcons.filter(
          (item) =>
            !item.isGroup &&
            !item.path.startsWith("deskall://") &&
            !(item.iconCustom && item.iconDataUrl),
        );
        let cursor = 0;
        let iconChanged = false;

        async function worker() {
          while (!cancelled) {
            const item = pending[cursor++];
            if (!item) return;
            try {
              const icon = await extractFittedIcon(item.path);
              if (!icon || icon === item.iconDataUrl || cancelled) continue;
              withIcons = withIcons.map((current) =>
                current.id === item.id
                  ? { ...current, iconDataUrl: icon, iconCustom: false }
                  : current,
              );
              iconChanged = true;
              setItems([...withIcons]);
            } catch {
              /* ignore */
            }
          }
        }

        await Promise.all([worker(), worker(), worker()]);
        if (!cancelled && iconChanged) {
          await store.set("shortcuts", withIcons);
          await store.save();
        }
      })();
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
        const nextKind =
          forcedKind &&
          ["app", "game", "folder", "file", "url"].includes(forcedKind)
            ? forcedKind
            : existing.kind;
        const pathChanged =
          existing.path.toLowerCase() !== finalPath.toLowerCase();
        const parentChanged =
          parentId !== undefined && existing.parentId !== parentId;
        const kindChanged = nextKind !== existing.kind;

        if (pathChanged || parentChanged || kindChanged) {
          const iconDataUrl =
            pathChanged && !existing.iconCustom
              ? ((await extractFittedIcon(finalPath)) ?? existing.iconDataUrl)
              : existing.iconDataUrl;
          const updated: ShortcutItem = {
            ...existing,
            path: finalPath,
            onDesktop: false,
            iconDataUrl,
            kind: nextKind,
            parentId:
              parentId !== undefined ? parentId : (existing.parentId ?? null),
          };
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
    async (
      name: string,
      parentId?: string | null,
      groupTab: DeskTabId = "apps",
    ) => {
      const items = itemsRef.current;
      const trimmed = name.trim() || "Nueva carpeta";
      const id = createId();
      const parent = parentId
        ? items.find((i) => i.id === parentId && i.isGroup)
        : null;
      const tab = parent?.groupTab ?? groupTab;
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
        groupTab: tab,
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
    async (
      id: string,
      iconDataUrl: string | null,
      options: boolean | { custom?: boolean; avatar?: boolean } = false,
    ) => {
      const opts =
        typeof options === "boolean"
          ? { custom: options, avatar: options }
          : {
              custom: Boolean(options.custom),
              avatar: Boolean(options.avatar),
            };
      const items = itemsRef.current;
      let fitted = iconDataUrl;
      if (fitted) {
        try {
          fitted = opts.avatar
            ? await prepareCustomAvatar(fitted, 192)
            : await fitIconDataUrl(fitted, 192);
        } catch {
          /* keep */
        }
      }
      await persist(
        items.map((i) =>
          i.id === id
            ? {
                ...i,
                iconDataUrl: fitted,
                iconCustom: fitted ? opts.custom : false,
              }
            : i,
        ),
      );
    },
    [persist],
  );

  const setKind = useCallback(
    async (id: string, kind: ItemKind) => {
      const items = itemsRef.current;
      await persist(
        items.map((i) =>
          i.id === id ? { ...i, kind, parentId: null } : i,
        ),
      );
    },
    [persist],
  );

  const setFavorite = useCallback(
    async (id: string, favorite: boolean) => {
      const items = itemsRef.current;
      await persist(
        items.map((i) => (i.id === id ? { ...i, favorite } : i)),
      );
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

  const replaceAll = useCallback(
    async (next: ShortcutItem[]) => {
      endUsageSession();
      await persist(next);
    },
    [persist, endUsageSession],
  );

  return {
    items,
    ready,
    copying,
    activeUsageId,
    activeSegmentStart,
    runningIds,
    addFromPath,
    addUrl,
    addGroup,
    moveToFolder,
    rename,
    setIcon,
    setKind,
    setFavorite,
    remove,
    reorder,
    startUsageSession,
    endUsageSession,
    resetUsage,
    replaceAll,
  };
}
