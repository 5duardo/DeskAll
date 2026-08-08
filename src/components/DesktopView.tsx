import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  AppWindow,
  ArrowUpCircle,
  ChevronLeft,
  Clock3,
  ExternalLink,
  FolderPlus,
  FolderOpen,
  Gamepad2,
  LayoutGrid,
  Link2,
  LoaderCircle,
  Pencil,
  Plus,
  Search,
  Star,
  X,
} from "./icons";
import type { DeskTabId, ItemKind, ShortcutItem } from "../types";
import { KIND_LABELS } from "../types";
import {
  getPathInfo,
  launchItem,
  listInstalledApps,
  openWithApp,
  openWithDialog,
  revealItem,
  scanInstalledApps,
  type InstalledApp,
} from "../lib/tauri";
import { formatUsage, liveUsageMs } from "../lib/usage";
import { btnGhost, btnPrimary, hideScrollbar, searchBox, toast as toastCls } from "../lib/ui";
import { ShortcutTile } from "./ShortcutTile";
import { GameBanner } from "./GameBanner";
import { ProgramIcon } from "./ProgramIcon";
import { FitIcon } from "./FitIcon";
import { EditShortcutModal } from "./EditShortcutModal";
import { FilesExplorer } from "./FilesExplorer";

type DeskTab = DeskTabId;

const MOVE_DRAG_THRESHOLD = 7;

function folderTabOf(item: ShortcutItem): DeskTabId {
  return item.groupTab ?? "apps";
}

/** Kind assigned when dropping/adding into the current desktop tab. */
function kindForDeskTab(
  tab: DeskTab,
  detected?: { kind?: string; isDir?: boolean },
): ItemKind {
  if (tab === "apps") return "app";
  if (tab === "games") return "game";
  if (detected?.isDir) return "folder";
  if (detected?.kind === "url") return "url";
  return "file";
}

function sortByUsage(items: ShortcutItem[], runningIds: Set<string>) {
  return [...items].sort((a, b) => {
    const aRunning = runningIds.has(a.id) ? 1 : 0;
    const bRunning = runningIds.has(b.id) ? 1 : 0;
    if (aRunning !== bRunning) return bRunning - aRunning;

    const aLastUsed = a.lastUsedAt ?? 0;
    const bLastUsed = b.lastUsedAt ?? 0;
    if (aLastUsed !== bLastUsed) return bLastUsed - aLastUsed;

    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}

interface Props {
  items: ShortcutItem[];
  activeUsageId?: string | null;
  activeSegmentStart?: number | null;
  /** Shortcut ids whose process is currently running */
  runningIds?: string[];
  onAddPath: (
    path: string,
    kind?: ItemKind,
    name?: string,
    parentId?: string | null,
  ) => Promise<unknown>;
  onAddUrl: (
    url: string,
    name?: string,
    parentId?: string | null,
  ) => Promise<unknown>;
  onAddGroup: (
    name: string,
    parentId?: string | null,
    groupTab?: DeskTabId,
  ) => Promise<unknown>;
  onMoveToFolder: (id: string, parentId: string | null) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onSetIcon: (
    id: string,
    iconDataUrl: string | null,
    options?: boolean | { custom?: boolean; avatar?: boolean },
  ) => Promise<void>;
  onSetKind: (id: string, kind: ItemKind) => Promise<void>;
  onSetFavorite: (id: string, favorite: boolean) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onReorder: (fromId: string, toId: string) => Promise<void>;
  onUsageStart: (id: string) => void;
  onOpenDetail: (item: ShortcutItem) => void;
}

type ModalMode =
  | null
  | "add"
  | "url"
  | "programs"
  | "folder"
  | "rename"
  | "menu"
  | "preview"
  | "move"
  | "openwith";

function Section({
  title,
  icon,
  items,
  selectedId,
  launchingId,
  runningIds,
  childCountOf,
  dropTargetId,
  draggingId,
  onSelect,
  onOpen,
  onContext,
  onMovePointerDown,
}: {
  title: string;
  icon: React.ReactNode;
  items: ShortcutItem[];
  selectedId: string | null;
  launchingId: string | null;
  runningIds: Set<string>;
  childCountOf: (id: string) => number;
  dropTargetId: string | null;
  draggingId: string | null;
  onSelect: (id: string) => void;
  onOpen: (item: ShortcutItem) => void;
  onContext: (item: ShortcutItem, e: React.MouseEvent) => void;
  onMovePointerDown: (e: React.PointerEvent, id: string) => void;
}) {
  if (!items.length) return null;
  return (
    <section className="flex flex-col gap-3">
      <header className="flex items-center gap-2 px-0.5">
        <span className="grid size-7 place-items-center rounded-lg bg-accent-soft text-accent-deep">
          {icon}
        </span>
        <h2 className="m-0 font-display text-lg tracking-tight">{title}</h2>
        <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent-deep">
          {items.length}
        </span>
      </header>
      <div
        className="grid auto-rows-min grid-cols-[repeat(auto-fill,minmax(132px,1fr))] content-start gap-3.5"
        role="list"
      >
        {items.map((item) => (
          <ShortcutTile
            key={item.id}
            item={item}
            selected={item.id === selectedId}
            launching={item.id === launchingId}
            active={runningIds.has(item.id)}
            childCount={childCountOf(item.id)}
            dropTarget={dropTargetId === item.id}
            dragging={draggingId === item.id}
            onSelect={() => onSelect(item.id)}
            onOpen={() => onOpen(item)}
            onContext={(e) => onContext(item, e)}
            onMovePointerDown={onMovePointerDown}
          />
        ))}
      </div>
    </section>
  );
}

export function DesktopView({
  items,
  activeUsageId = null,
  activeSegmentStart = null,
  runningIds: runningIdsProp = [],
  onAddPath,
  onAddUrl,
  onAddGroup,
  onMoveToFolder,
  onRename,
  onSetIcon,
  onSetKind,
  onSetFavorite,
  onRemove,
  onReorder,
  onUsageStart,
  onOpenDetail,
}: Props) {
  const [query, setQuery] = useState("");
  const [deskTab, setDeskTab] = useState<DeskTab>("apps");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalMode>(null);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const [draftName, setDraftName] = useState("");
  const [draftUrl, setDraftUrl] = useState("");
  const [draftKind, setDraftKind] = useState<ItemKind>("app");
  const [busy, setBusy] = useState(false);
  const [dropping, setDropping] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [rootDropActive, setRootDropActive] = useState(false);
  const [dragGhost, setDragGhost] = useState<{
    name: string;
    x: number;
    y: number;
  } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const [installed, setInstalled] = useState<InstalledApp[]>([]);
  const [installedQuery, setInstalledQuery] = useState("");
  const [installedLoading, setInstalledLoading] = useState(false);
  const [installedScanning, setInstalledScanning] = useState(false);
  const [openWithApps, setOpenWithApps] = useState<InstalledApp[]>([]);
  const [openWithLoading, setOpenWithLoading] = useState(false);
  const [openWithQuery, setOpenWithQuery] = useState("");
  const [pickedPaths, setPickedPaths] = useState<Set<string>>(() => new Set());
  const scanGen = useRef(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const clickTimer = useRef<number | null>(null);
  const pendingMove = useRef<{
    id: string;
    x: number;
    y: number;
  } | null>(null);
  const moveActive = useRef(false);
  const suppressClick = useRef(false);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const runningIds = useMemo(
    () => new Set(runningIdsProp),
    [runningIdsProp],
  );

  const currentFolder = folderId
    ? (items.find((i) => i.id === folderId && i.isGroup) ?? null)
    : null;

  // Leave folder when deleted or when switching to another tab
  useEffect(() => {
    if (!folderId) return;
    const folder = items.find((i) => i.id === folderId && i.isGroup);
    if (!folder || folderTabOf(folder) !== deskTab) {
      setFolderId(null);
    }
  }, [folderId, items, deskTab]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const atLevel = items.filter((i) => (i.parentId ?? null) === folderId);
    if (!q) return atLevel;
    return atLevel.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.path.toLowerCase().includes(q) ||
        i.kind.includes(q),
    );
  }, [items, query, folderId]);

  /** Folders only for the active tab (never shared across tabs). */
  const groups = useMemo(
    () =>
      filtered.filter(
        (i) => i.isGroup && folderTabOf(i) === deskTab && deskTab !== "games",
      ),
    [filtered, deskTab],
  );
  const apps = useMemo(
    () =>
      sortByUsage(
        filtered.filter((i) => !i.isGroup && i.kind === "app"),
        runningIds,
      ),
    [filtered, runningIds],
  );
  const games = useMemo(
    () =>
      sortByUsage(
        filtered.filter((i) => !i.isGroup && i.kind === "game"),
        runningIds,
      ),
    [filtered, runningIds],
  );
  const favoriteGames = useMemo(
    () => games.filter((i) => i.favorite),
    [games],
  );
  const otherGames = useMemo(
    () => games.filter((i) => !i.favorite),
    [games],
  );
  const others = useMemo(
    () =>
      sortByUsage(
        filtered.filter(
          (i) => !i.isGroup && i.kind !== "app" && i.kind !== "game",
        ),
        runningIds,
      ),
    [filtered, runningIds],
  );

  const allGroups = useMemo(
    () =>
      items.filter(
        (i) => i.isGroup && folderTabOf(i) === deskTab && deskTab !== "games",
      ),
    [items, deskTab],
  );

  const childCountOf = useMemo(() => {
    const map = new Map<string, number>();
    for (const i of items) {
      if (i.parentId) {
        map.set(i.parentId, (map.get(i.parentId) ?? 0) + 1);
      }
    }
    return (id: string) => map.get(id) ?? 0;
  }, [items]);

  const tabItems = useMemo(() => {
    if (deskTab === "apps") return [...groups, ...apps];
    if (deskTab === "games") return games;
    return others;
  }, [deskTab, groups, apps, games, others]);

  const selected = items.find((i) => i.id === selectedId) ?? null;
  const launchingItem =
    items.find((i) => i.id === launchingId) ?? selected;

  useEffect(() => {
    const unlisten = getCurrentWindow().onDragDropEvent(async (event) => {
      if (event.payload.type === "enter" || event.payload.type === "over") {
        setDropping(true);
        return;
      }
      if (event.payload.type === "leave") {
        setDropping(false);
        return;
      }
      if (event.payload.type !== "drop") return;
      setDropping(false);
      const paths = event.payload.paths ?? [];
      let added = 0;
      for (const path of paths) {
        try {
          let kind: ItemKind;
          if (deskTab === "apps") {
            kind = "app";
          } else if (deskTab === "games") {
            kind = "game";
          } else {
            const info = await getPathInfo(path);
            kind = kindForDeskTab("files", info);
          }
          await onAddPath(path, kind, undefined, folderId);
          added += 1;
        } catch (err) {
          flash(String(err));
        }
      }
      if (added) {
        const where =
          deskTab === "games"
            ? "Juegos"
            : deskTab === "files"
              ? "Archivos"
              : "Apps";
        flash(`${added} añadido(s) en ${where}`);
      }
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, [onAddPath, folderId, deskTab]);

  function openAddModal() {
    setDraftKind(kindForDeskTab(deskTab));
    setModal("add");
  }

  function flash(msg: string) {
    const clean = msg
      .replace(/^Error:\s*/i, "")
      .replace(/Launcher[\s\S]*$/i, "No se pudo abrir (revisa la ruta)")
      .trim();
    setToast(clean.length > 140 ? `${clean.slice(0, 140)}…` : clean);
    window.setTimeout(() => setToast(null), 2800);
  }

  async function pickFiles() {
    setBusy(true);
    try {
      const result = await open({
        multiple: true,
        directory: false,
        title: "Elegir apps, juegos, accesos directos o archivos",
        filters: [
          {
            name: "Accesos y apps",
            extensions: ["lnk", "exe", "url", "bat", "cmd", "app"],
          },
          { name: "Todos", extensions: ["*"] },
        ],
      });
      const paths = Array.isArray(result) ? result : result ? [result] : [];
      for (const path of paths) {
        await onAddPath(path, draftKind, undefined, folderId);
      }
      if (paths.length) flash("Guardado en librería interna");
      setModal(null);
    } finally {
      setBusy(false);
    }
  }

  async function pickFolder() {
    setBusy(true);
    try {
      const result = await open({
        multiple: false,
        directory: true,
        title: "Elegir carpeta",
      });
      if (typeof result === "string") {
        await onAddPath(result, "folder", undefined, folderId);
        flash("Carpeta añadida");
        setModal(null);
      }
    } finally {
      setBusy(false);
    }
  }

  async function openProgramsPicker() {
    setModal("programs");
    setInstalledQuery("");
    setPickedPaths(new Set());

    // Already have a full list — show instantly
    if (installed.length && !installedScanning) {
      setInstalledLoading(false);
      return;
    }

    const gen = ++scanGen.current;
    setInstalled([]);
    setInstalledLoading(true);
    setInstalledScanning(true);

    const mergeBatch = (batch: InstalledApp[]) => {
      if (gen !== scanGen.current) return;
      setInstalled((prev) => {
        const map = new Map(prev.map((a) => [a.name.toLowerCase(), a]));
        for (const app of batch) {
          if (!map.has(app.name.toLowerCase())) {
            map.set(app.name.toLowerCase(), app);
          }
        }
        return Array.from(map.values()).sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
        );
      });
      setInstalledLoading(false);
    };

    try {
      await scanInstalledApps(mergeBatch);
    } catch (err) {
      // Fallback: one-shot list if channel scan fails
      try {
        const list = await listInstalledApps();
        if (gen === scanGen.current) {
          setInstalled(list);
          setInstalledLoading(false);
        }
      } catch (err2) {
        flash(String(err2 ?? err));
        if (gen === scanGen.current) setModal("add");
      }
    } finally {
      if (gen === scanGen.current) {
        setInstalledScanning(false);
        setInstalledLoading(false);
      }
    }
  }

  function togglePicked(path: string) {
    setPickedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  async function addPickedPrograms() {
    if (!pickedPaths.size) return;
    setBusy(true);
    let added = 0;
    try {
      for (const path of pickedPaths) {
        const app = installed.find((a) => a.path === path);
        try {
          await onAddPath(path, draftKind, app?.name, folderId);
          added += 1;
        } catch (err) {
          flash(String(err));
        }
      }
      if (added) flash(`${added} programa(s) añadido(s)`);
      setModal(null);
      setPickedPaths(new Set());
    } finally {
      setBusy(false);
    }
  }

  const filteredInstalled = useMemo(() => {
    const addedNames = new Set<string>();
    const addedPaths = new Set<string>();
    for (const item of items) {
      if (item.isGroup) continue;
      addedNames.add(item.name.trim().toLowerCase());
      const norm = item.path.replace(/\//g, "\\").toLowerCase();
      addedPaths.add(norm);
      const base = norm.split("\\").pop() ?? "";
      const stem = base.replace(/\.[^.]+$/, "");
      if (stem) addedNames.add(stem);
    }

    const available = installed.filter((app) => {
      const name = app.name.trim().toLowerCase();
      const path = app.path.replace(/\//g, "\\").toLowerCase();
      if (addedPaths.has(path)) return false;
      if (addedNames.has(name)) return false;
      return true;
    });

    const q = installedQuery.trim().toLowerCase();
    if (!q) return available;
    return available.filter(
      (a) =>
        a.name.toLowerCase().includes(q) || a.path.toLowerCase().includes(q),
    );
  }, [installed, installedQuery, items]);

  async function submitUrl(e: React.FormEvent) {
    e.preventDefault();
    if (!draftUrl.trim()) return;
    const url = /^https?:\/\//i.test(draftUrl)
      ? draftUrl.trim()
      : `https://${draftUrl.trim()}`;
    await onAddUrl(url, draftName || undefined, folderId);
    setDraftUrl("");
    setDraftName("");
    setModal(null);
    flash("URL añadida");
  }

  async function submitFolder(e: React.FormEvent) {
    e.preventDefault();
    const name = draftName.trim() || "Nueva carpeta";
    await onAddGroup(name, folderId, deskTab === "games" ? "apps" : deskTab);
    setDraftName("");
    setModal(null);
    flash(`Carpeta «${name}» creada`);
  }

  async function openEdit(item: ShortcutItem) {
    setSelectedId(item.id);
    setModal("rename");
  }

  function clearMoveDrag() {
    pendingMove.current = null;
    moveActive.current = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    setDraggingId(null);
    setDropTargetId(null);
    setRootDropActive(false);
    setDragGhost(null);
  }

  function hitDropTarget(clientX: number, clientY: number): {
    kind: "folder" | "item" | "root";
    id: string | null;
  } | null {
    const el = document.elementFromPoint(clientX, clientY);
    if (!el || !(el instanceof Element)) return null;
    const root = el.closest("[data-deskall-drop='root']");
    if (root) return { kind: "root", id: null };
    const node = el.closest("[data-deskall-id]");
    if (!node) return null;
    const id = node.getAttribute("data-deskall-id");
    const drop = node.getAttribute("data-deskall-drop");
    if (!id) return null;
    if (drop === "folder") return { kind: "folder", id };
    return { kind: "item", id };
  }

  function onMovePointerDown(e: React.PointerEvent, id: string) {
    if (e.button !== 0) return;
    pendingMove.current = { id, x: e.clientX, y: e.clientY };
    moveActive.current = false;
  }

  useEffect(() => {
    let frame = 0;
    let latestPointer: PointerEvent | null = null;

    function processPointerMove(e: PointerEvent) {
      const pending = pendingMove.current;
      if (!pending) return;

      const dx = e.clientX - pending.x;
      const dy = e.clientY - pending.y;
      if (!moveActive.current) {
        if (Math.hypot(dx, dy) < MOVE_DRAG_THRESHOLD) return;
        moveActive.current = true;
        suppressClick.current = true;
        document.body.style.cursor = "grabbing";
        document.body.style.userSelect = "none";
        if (clickTimer.current) {
          window.clearTimeout(clickTimer.current);
          clickTimer.current = null;
        }
        setDraggingId(pending.id);
        const item = itemsRef.current.find((i) => i.id === pending.id);
        setDragGhost({
          name: item?.name ?? "App",
          x: e.clientX,
          y: e.clientY,
        });
      } else {
        setDragGhost((g) =>
          g ? { ...g, x: e.clientX, y: e.clientY } : g,
        );
      }

      const hit = hitDropTarget(e.clientX, e.clientY);
      if (!hit || hit.id === pending.id) {
        setDropTargetId(null);
        setRootDropActive(false);
        return;
      }
      if (hit.kind === "root") {
        setDropTargetId(null);
        setRootDropActive(true);
        return;
      }
      setRootDropActive(false);
      setDropTargetId(hit.id);
    }

    function onPointerMove(e: PointerEvent) {
      latestPointer = e;
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const pointer = latestPointer;
        latestPointer = null;
        if (pointer) processPointerMove(pointer);
      });
    }

    function onPointerUp(e: PointerEvent) {
      if (frame) {
        window.cancelAnimationFrame(frame);
        frame = 0;
        latestPointer = null;
      }
      const pending = pendingMove.current;
      if (!pending) return;

      const wasDragging = moveActive.current;
      const fromId = pending.id;
      pendingMove.current = null;
      moveActive.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setDragGhost(null);
      setDraggingId(null);

      if (!wasDragging) {
        setDropTargetId(null);
        setRootDropActive(false);
        return;
      }

      const hit = hitDropTarget(e.clientX, e.clientY);
      setDropTargetId(null);
      setRootDropActive(false);

      if (!hit || (hit.id && hit.id === fromId)) {
        window.setTimeout(() => {
          suppressClick.current = false;
        }, 0);
        return;
      }

      const source = itemsRef.current.find((i) => i.id === fromId);
      if (!source || source.isGroup) {
        suppressClick.current = false;
        return;
      }

      if (hit.kind === "root") {
        if ((source.parentId ?? null) !== null) {
          void onMoveToFolder(fromId, null).then(() =>
            flash("Movido al escritorio"),
          );
        }
      } else if (hit.kind === "folder" && hit.id) {
        const folder = itemsRef.current.find((i) => i.id === hit.id);
        if (!folder?.isGroup || folderTabOf(folder) === "games") {
          suppressClick.current = false;
          return;
        }
        // Only drop into folders of the matching tab / apps folders for apps
        void onMoveToFolder(fromId, hit.id).then(() => {
          flash(`Movido a «${folder.name}»`);
        });
      } else if (hit.kind === "item" && hit.id) {
        const target = itemsRef.current.find((i) => i.id === hit.id);
        if (target?.isGroup) {
          void onMoveToFolder(fromId, target.id).then(() =>
            flash(`Movido a «${target.name}»`),
          );
        } else if (target) {
          void onReorder(fromId, target.id);
        }
      }

      window.setTimeout(() => {
        suppressClick.current = false;
      }, 0);
    }

    function onPointerCancel() {
      clearMoveDrag();
      suppressClick.current = false;
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
    };
  }, [onMoveToFolder, onReorder]);

  async function openSelected(item = selected) {
    if (!item || launchingId) return;
    if (item.isGroup) {
      setModal(null);
      setFolderId(item.id);
      setSelectedId(null);
      return;
    }
    setModal(null);
    setLaunchingId(item.id);
    setSelectedId(item.id);
    onUsageStart(item.id);
    window.setTimeout(async () => {
      try {
        await launchItem(item.path);
      } catch (err) {
        flash(String(err));
      } finally {
        window.setTimeout(() => setLaunchingId(null), 120);
      }
    }, 380);
  }

  function handleTileClick(id: string) {
    if (suppressClick.current || moveActive.current) return;
    const item = items.find((i) => i.id === id);
    // Category folders open on single click — no preview modal
    if (item?.isGroup) {
      if (clickTimer.current) {
        window.clearTimeout(clickTimer.current);
        clickTimer.current = null;
      }
      setFolderId(item.id);
      setSelectedId(null);
      setModal(null);
      return;
    }

    if (clickTimer.current) {
      window.clearTimeout(clickTimer.current);
      clickTimer.current = null;
      return;
    }
    clickTimer.current = window.setTimeout(() => {
      clickTimer.current = null;
      setSelectedId(id);
      if (item) onOpenDetail(item);
    }, 210);
  }

  function handleTileOpen(item: ShortcutItem) {
    if (clickTimer.current) {
      window.clearTimeout(clickTimer.current);
      clickTimer.current = null;
    }
    void openSelected(item);
  }

  function openContext(item: ShortcutItem, e: React.MouseEvent) {
    e.preventDefault();
    setSelectedId(item.id);
    const pad = 12;
    const estW = 240;
    const estH = 320;
    let x = e.clientX;
    let y = e.clientY;
    if (x + estW > window.innerWidth - pad) {
      x = Math.max(pad, window.innerWidth - estW - pad);
    }
    if (y + estH > window.innerHeight - pad) {
      y = Math.max(pad, window.innerHeight - estH - pad);
    }
    setMenuPos({ x, y });
    setModal("menu");
  }

  useLayoutEffect(() => {
    if (modal !== "menu" || !menuRef.current) return;
    const el = menuRef.current;
    const rect = el.getBoundingClientRect();
    const pad = 12;
    let x = menuPos.x;
    let y = menuPos.y;
    if (rect.right > window.innerWidth - pad) {
      x = Math.max(pad, window.innerWidth - rect.width - pad);
    }
    if (rect.bottom > window.innerHeight - pad) {
      y = Math.max(pad, window.innerHeight - rect.height - pad);
    }
    if (rect.left < pad) x = pad;
    if (rect.top < pad) y = pad;
    if (x !== menuPos.x || y !== menuPos.y) {
      setMenuPos({ x, y });
    }
  }, [modal, menuPos, selectedId]);

  return (
    <section
      className={[
        "relative flex h-full min-h-0 flex-col gap-4 rounded-2xl transition",
        dropping
          ? "bg-accent-soft/40 ring-2 ring-accent ring-offset-2 ring-offset-transparent"
          : "",
      ].join(" ")}
    >
      {dropping && (
        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-2xl border-2 border-dashed border-accent bg-accent-soft/50 backdrop-blur-[1px]">
          <p className="font-display text-lg text-accent-deep">
            {deskTab === "games"
              ? "Suelta aquí para añadir a Juegos"
              : deskTab === "files"
                ? "Suelta aquí para añadir a Archivos"
                : "Suelta aquí para añadir a Apps"}
          </p>
        </div>
      )}

      <header className="flex flex-col items-stretch gap-3">
        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            {currentFolder && (
              <div className="flex items-center gap-1.5 px-0.5">
                <button
                  type="button"
                  data-deskall-drop="root"
                  className={[
                    "inline-flex cursor-pointer items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition",
                    rootDropActive
                      ? "border-accent bg-accent-soft text-accent-deep ring-2 ring-accent/25"
                      : "border-line bg-surface text-ink-soft",
                  ].join(" ")}
                  onClick={() => setFolderId(null)}
                >
                  <ChevronLeft className="size-3.5" strokeWidth={1.8} />
                  {rootDropActive ? "Soltar en escritorio" : "Escritorio"}
                </button>
                <span className="text-xs text-muted">/</span>
                <span className="truncate text-xs font-medium text-ink">
                  {currentFolder.name}
                </span>
              </div>
            )}
            <div className={`${searchBox} max-w-none sm:max-w-[420px]`}>
              <Search className="size-4 shrink-0 text-muted" strokeWidth={1.8} />
              <input
                className="w-full border-0 bg-transparent text-ink outline-none"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={
                  deskTab === "games"
                    ? "Buscar juegos…"
                    : deskTab === "files"
                      ? "Buscar archivos de DeskAll…"
                      : "Buscar apps…"
                }
                aria-label="Buscar"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className={btnGhost} onClick={openAddModal}>
              <Plus className="size-4" strokeWidth={1.8} />
              Añadir
            </button>
          </div>
        </div>

        {!currentFolder && (
          <nav
            className="flex gap-1 rounded-2xl border border-line bg-surface/80 p-1"
            aria-label="Secciones del escritorio"
          >
            {(
              [
                {
                  id: "apps" as const,
                  label: "Apps",
                  count: groups.length + apps.length as number | undefined,
                  icon: AppWindow,
                },
                {
                  id: "games" as const,
                  label: "Juegos",
                  count: games.length as number | undefined,
                  icon: Gamepad2,
                },
                {
                  id: "files" as const,
                  label: "Archivos",
                  count: others.length as number | undefined,
                  icon: FolderOpen,
                },
              ]
            ).map(({ id, label, count, icon: Icon }) => {
              const active = deskTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  className={[
                    "flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border-0 px-3 py-2.5 text-sm font-medium transition",
                    active
                      ? "bg-paper text-ink shadow-sm"
                      : "bg-transparent text-muted hover:text-ink",
                  ].join(" ")}
                  onClick={() => setDeskTab(id)}
                  aria-pressed={active}
                >
                  <Icon className="size-4 shrink-0" strokeWidth={1.8} />
                  <span>{label}</span>
                  {typeof count === "number" && (
                    <span
                      className={[
                        "rounded-full px-1.5 py-0.5 text-[11px] tabular-nums",
                        active
                          ? "bg-accent-soft text-accent-deep"
                          : "bg-ink/5 text-muted",
                      ].join(" ")}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        )}
      </header>

      {deskTab === "files" && !currentFolder ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-1 pb-2">
          <FilesExplorer
            items={others}
            runningIds={runningIds}
            query={query}
            selectedId={selectedId}
            launchingId={launchingId}
            onSelect={handleTileClick}
            onOpen={handleTileOpen}
            onContext={openContext}
            onAdd={openAddModal}
          />
        </div>
      ) : tabItems.length === 0 ? (
        <div className="grid flex-1 animate-rise place-content-center justify-items-center gap-2 p-8 text-center">
          {currentFolder ? (
            <>
              <h2 className="m-0 font-display text-[1.45rem] tracking-tight">
                {currentFolder.name} está vacía
              </h2>
              <p className="mb-2 max-w-md text-ink-soft leading-relaxed">
                Añade programas o arrastra apps aquí para organizar esta categoría.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  className={btnGhost}
                  onClick={() => setFolderId(null)}
                >
                  <ChevronLeft className="size-4" strokeWidth={1.8} />
                  Volver
                </button>
                <button
                  type="button"
                  className={btnPrimary}
                  onClick={openAddModal}
                >
                  <Plus className="size-4" strokeWidth={1.8} />
                  Añadir
                </button>
              </div>
            </>
          ) : (
            <>
              <h2 className="m-0 font-display text-[1.45rem] tracking-tight">
                {deskTab === "games" ? "Sin juegos aún" : "Sin apps aún"}
              </h2>
              <p className="mb-2 max-w-md text-ink-soft leading-relaxed">
                {deskTab === "games"
                  ? "Arrastra juegos aquí o usa Añadir — se guardan como Juego."
                  : "Arrastra accesos aquí o usa Añadir — se guardan como App."}
              </p>
              <button type="button" className={btnPrimary} onClick={openAddModal}>
                <Plus className="size-4" strokeWidth={1.8} />
                Añadir
              </button>
            </>
          )}
        </div>
      ) : deskTab === "games" && !currentFolder ? (
        <div
          className={`flex flex-1 flex-col gap-7 overflow-auto px-1 pb-4 ${hideScrollbar}`}
        >
          {favoriteGames.length > 0 && (
            <section className="flex flex-col gap-3">
              <header className="flex items-center gap-2 px-0.5">
                <span className="grid size-7 place-items-center rounded-lg bg-accent-soft text-accent-deep">
                  <Star className="size-4" strokeWidth={1.8} />
                </span>
                <h2 className="m-0 font-display text-lg tracking-tight">
                  Favoritos
                </h2>
                <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent-deep">
                  {favoriteGames.length}
                </span>
              </header>
              <div
                className="grid auto-rows-min grid-cols-[repeat(auto-fill,minmax(200px,1fr))] content-start gap-3.5 sm:grid-cols-[repeat(auto-fill,minmax(220px,1fr))]"
                role="list"
              >
                {favoriteGames.map((item) => (
                  <GameBanner
                    key={item.id}
                    item={item}
                    selected={item.id === selectedId}
                    launching={item.id === launchingId}
                    active={runningIds.has(item.id)}
                    dropTarget={dropTargetId === item.id}
                    dragging={draggingId === item.id}
                    onSelect={() => handleTileClick(item.id)}
                    onOpen={() => handleTileOpen(item)}
                    onContext={(e) => openContext(item, e)}
                    onMovePointerDown={onMovePointerDown}
                    onToggleFavorite={() =>
                      void onSetFavorite(item.id, !item.favorite)
                    }
                  />
                ))}
              </div>
            </section>
          )}
          {otherGames.length > 0 && (
            <section className="flex flex-col gap-3">
              <header className="flex items-center gap-2 px-0.5">
                <span className="grid size-7 place-items-center rounded-lg bg-accent-soft text-accent-deep">
                  <Gamepad2 className="size-4" strokeWidth={1.8} />
                </span>
                <h2 className="m-0 font-display text-lg tracking-tight">
                  {favoriteGames.length > 0 ? "Todos" : "Juegos"}
                </h2>
                <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent-deep">
                  {otherGames.length}
                </span>
              </header>
              <div
                className="grid auto-rows-min grid-cols-[repeat(auto-fill,minmax(200px,1fr))] content-start gap-3.5 sm:grid-cols-[repeat(auto-fill,minmax(220px,1fr))]"
                role="list"
              >
                {otherGames.map((item) => (
                  <GameBanner
                    key={item.id}
                    item={item}
                    selected={item.id === selectedId}
                    launching={item.id === launchingId}
                    active={runningIds.has(item.id)}
                    dropTarget={dropTargetId === item.id}
                    dragging={draggingId === item.id}
                    onSelect={() => handleTileClick(item.id)}
                    onOpen={() => handleTileOpen(item)}
                    onContext={(e) => openContext(item, e)}
                    onMovePointerDown={onMovePointerDown}
                    onToggleFavorite={() =>
                      void onSetFavorite(item.id, !item.favorite)
                    }
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      ) : (
        <div className={`flex flex-1 flex-col gap-7 overflow-auto px-2 pb-4 ${hideScrollbar}`}>
          {deskTab === "apps" || currentFolder ? (
            <>
              {(currentFolder ? filtered.filter((i) => i.isGroup) : groups).length >
                0 && (
                <Section
                  title="Carpetas"
                  icon={<FolderOpen className="size-4" strokeWidth={1.8} />}
                  items={
                    currentFolder
                      ? filtered.filter((i) => i.isGroup)
                      : groups
                  }
                  selectedId={selectedId}
                  launchingId={launchingId}
                  runningIds={runningIds}
                  childCountOf={childCountOf}
                  dropTargetId={dropTargetId}
                  draggingId={draggingId}
                  onSelect={handleTileClick}
                  onOpen={handleTileOpen}
                  onContext={openContext}
                  onMovePointerDown={onMovePointerDown}
                />
              )}
              <Section
                title={currentFolder ? "Contenido" : "Apps"}
                icon={<AppWindow className="size-4" strokeWidth={1.8} />}
                items={
                  currentFolder
                    ? filtered.filter((i) => !i.isGroup)
                    : apps
                }
                selectedId={selectedId}
                launchingId={launchingId}
                runningIds={runningIds}
                childCountOf={childCountOf}
                dropTargetId={dropTargetId}
                draggingId={draggingId}
                onSelect={handleTileClick}
                onOpen={handleTileOpen}
                onContext={openContext}
                onMovePointerDown={onMovePointerDown}
              />
            </>
          ) : null}
        </div>
      )}

      {dragGhost &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[200] max-w-[160px] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-accent/40 bg-surface px-3 py-2 text-sm font-semibold text-ink shadow-desk"
            style={{ left: dragGhost.x, top: dragGhost.y }}
          >
            {dragGhost.name}
          </div>,
          document.body,
        )}

      {launchingId &&
        launchingItem &&
        createPortal(
          <div
            className="launch-veil pointer-events-none fixed inset-0 z-[120] grid place-items-center bg-paper/55 backdrop-blur-[3px]"
            aria-hidden
          >
            <div className="launch-icon flex flex-col items-center gap-3">
              {launchingItem.iconDataUrl ? (
                <FitIcon
                  src={launchingItem.iconDataUrl}
                  className="size-24 drop-shadow-xl"
                  size={192}
                />
              ) : (
                <span
                  className="grid size-20 place-items-center rounded-3xl text-white shadow-desk"
                  style={{ background: launchingItem.color }}
                >
                  <AppWindow className="size-10" strokeWidth={1.5} />
                </span>
              )}
              <p className="m-0 font-display text-lg font-semibold tracking-tight text-ink">
                {launchingItem.name}
              </p>
            </div>
          </div>,
          document.body,
        )}

      {modal === "preview" &&
        selected &&
        createPortal(
          <div className="fixed inset-0 z-[100] grid place-items-center p-4">
            <button
              type="button"
              className="absolute inset-0 border-0 bg-ink/30 backdrop-blur-[3px]"
              aria-label="Cerrar"
              onClick={() => setModal(null)}
            />
            <div
              className="relative z-[101] w-[min(400px,calc(100vw-2rem))] animate-rise-fast rounded-[22px] border border-line bg-paper p-6 shadow-desk"
              role="dialog"
              aria-modal
              aria-label={selected.name}
            >
              <button
                type="button"
                className="absolute top-3 right-3 grid size-8 cursor-pointer place-items-center rounded-full border-0 bg-transparent text-muted hover:bg-accent-soft hover:text-ink"
                onClick={() => setModal(null)}
                aria-label="Cerrar"
              >
                <X className="size-4" strokeWidth={1.8} />
              </button>

              <div className="flex flex-col items-center gap-3 text-center">
                <div className="relative">
                  {selected.iconDataUrl ? (
                    <FitIcon
                      src={selected.iconDataUrl}
                      className="size-20"
                      size={160}
                    />
                  ) : (
                    <span
                      className="grid size-16 place-items-center rounded-2xl text-white"
                      style={{ background: selected.color }}
                    >
                      {selected.isGroup ? (
                        <FolderOpen className="size-8" strokeWidth={1.6} />
                      ) : (
                        <AppWindow className="size-8" strokeWidth={1.6} />
                      )}
                    </span>
                  )}
                  {runningIds.has(selected.id) && (
                    <span
                      className="absolute -right-0.5 -bottom-0.5 grid size-5 place-items-center rounded-full border-2 border-paper bg-[#22c55e] shadow"
                      title="En uso"
                      aria-label="En uso"
                    >
                      <span className="size-2 animate-pulse rounded-full bg-white" />
                    </span>
                  )}
                </div>
                <div>
                  <h3 className="m-0 font-display text-xl tracking-tight">
                    {selected.name}
                  </h3>
                  <p className="mt-1 m-0 text-sm text-muted">
                    {selected.isGroup
                      ? `Carpeta · ${childCountOf(selected.id)} ítems`
                      : KIND_LABELS[selected.kind]}
                    {!selected.isGroup && runningIds.has(selected.id)
                      ? " · En uso"
                      : ""}
                  </p>
                </div>
                {!selected.isGroup && (
                  <>
                    <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-muted">
                      <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 text-ink-soft">
                        <Clock3 className="size-3.5" strokeWidth={1.8} />
                        <LiveUsage
                          baseMs={selected.usageMs ?? 0}
                          segmentStart={
                            activeUsageId === selected.id
                              ? activeSegmentStart
                              : null
                          }
                        />{" "}
                        de uso
                      </span>
                      <span className="rounded-full bg-accent-soft px-2.5 py-1 text-ink-soft">
                        {selected.launchCount ?? 0} aperturas
                      </span>
                    </div>
                    <p
                      className="m-0 max-w-full truncate rounded-xl bg-accent-soft/60 px-3 py-2 font-mono text-xs text-ink-soft"
                      title={selected.path}
                    >
                      {selected.path}
                    </p>
                  </>
                )}
              </div>

              <div className="mt-5 flex flex-col gap-2">
                <button
                  type="button"
                  className={btnPrimary}
                  onClick={() => void openSelected(selected)}
                >
                  {selected.isGroup ? (
                    <FolderOpen className="size-4" strokeWidth={1.8} />
                  ) : (
                    <ExternalLink className="size-4" strokeWidth={1.8} />
                  )}
                  {selected.isGroup ? "Abrir carpeta" : "Abrir"}
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className={btnGhost}
                    onClick={() => {
                      setModal(null);
                      onOpenDetail(selected);
                    }}
                  >
                    <ExternalLink className="size-4" strokeWidth={1.8} />
                    Detalles
                  </button>
                  <button
                    type="button"
                    className={btnGhost}
                    onClick={() => void openEdit(selected)}
                  >
                    <Pencil className="size-4" strokeWidth={1.8} />
                    Editar
                  </button>
                  {!selected.isGroup ? (
                    <button
                      type="button"
                      className={btnGhost}
                      onClick={() =>
                        void revealItem(selected.path).catch((e) =>
                          flash(String(e)),
                        )
                      }
                    >
                      Ubicación
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={btnGhost}
                      onClick={() => {
                        void onRemove(selected.id);
                        setSelectedId(null);
                        setModal(null);
                      }}
                    >
                      Eliminar
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {modal === "menu" &&
        selected &&
        createPortal(
          <>
            <button
              type="button"
              className="fixed inset-0 z-[80] border-0 bg-ink/28 backdrop-blur-[2px]"
              aria-label="Cerrar menú"
              onClick={() => setModal(null)}
            />
            <div
              ref={menuRef}
              className="fixed z-[90] flex max-h-[min(420px,calc(100vh-24px))] min-w-[220px] flex-col overflow-y-auto rounded-[14px] border border-line bg-paper p-1.5 shadow-desk [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              style={{ left: menuPos.x, top: menuPos.y }}
              role="menu"
            >
              <CtxBtn onClick={() => void openSelected(selected)}>
                {selected.isGroup ? "Abrir carpeta" : "Abrir"}
              </CtxBtn>
              <CtxBtn onClick={() => void openEdit(selected)}>Editar</CtxBtn>
              {!selected.isGroup &&
                selected.kind !== "game" &&
                selected.kind !== "folder" &&
                deskTab !== "games" && (
                <CtxBtn onClick={() => setModal("move")}>
                  Mover a carpeta…
                </CtxBtn>
              )}
              {!selected.isGroup && selected.kind === "game" && (
                <CtxBtn
                  onClick={() => {
                    void onSetFavorite(selected.id, !selected.favorite);
                    setModal(null);
                    flash(
                      selected.favorite
                        ? "Quitado de favoritos"
                        : "Añadido a favoritos",
                    );
                  }}
                >
                  {selected.favorite
                    ? "Quitar de favoritos"
                    : "Marcar como favorito"}
                </CtxBtn>
              )}
              {!selected.isGroup && selected.kind === "game" && (
                <CtxBtn
                  onClick={() => {
                    void onSetKind(selected.id, "app");
                    setDeskTab("apps");
                    setModal(null);
                    flash("Movido a Apps");
                  }}
                >
                  Mover a Apps
                </CtxBtn>
              )}
              {!selected.isGroup && selected.kind === "app" && (
                <CtxBtn
                  onClick={() => {
                    void onSetKind(selected.id, "game");
                    setDeskTab("games");
                    setModal(null);
                    flash("Movido a Juegos");
                  }}
                >
                  Mover a Juegos
                </CtxBtn>
              )}
              {!selected.isGroup && (
                <CtxBtn
                  onClick={() =>
                    void revealItem(selected.path).catch((e) => flash(String(e)))
                  }
                >
                  Mostrar en librería
                </CtxBtn>
              )}
              {!selected.isGroup && selected.kind === "folder" && (
                <CtxBtn
                  onClick={() => {
                    setOpenWithLoading(true);
                    setOpenWithQuery("");
                    void openWithDialog(selected.path)
                      .then((apps) => {
                        setOpenWithApps(apps);
                        setModal("openwith");
                      })
                      .catch((e) => flash(String(e)))
                      .finally(() => setOpenWithLoading(false));
                  }}
                >
                  Abrir con…
                </CtxBtn>
              )}
              <CtxBtn
                danger
                onClick={() => {
                  void onRemove(selected.id);
                  setSelectedId(null);
                  setModal(null);
                }}
              >
                {selected.isGroup ? "Eliminar carpeta" : "Quitar de DeskAll"}
              </CtxBtn>
            </div>
          </>,
          document.body,
        )}

      {modal === "openwith" &&
        selected &&
        createPortal(
          <div className="fixed inset-0 z-[100] grid place-items-center p-4">
            <button
              type="button"
              className="absolute inset-0 border-0 bg-ink/30 backdrop-blur-[3px]"
              aria-label="Cerrar"
              onClick={() => setModal(null)}
            />
            <div
              className="relative z-[101] flex max-h-[min(520px,calc(100vh-2rem))] w-[min(420px,calc(100vw-2rem))] flex-col animate-rise-fast rounded-[22px] border border-line bg-paper shadow-desk"
              role="dialog"
              aria-modal
              aria-label={`Abrir ${selected.name} con`}
            >
              <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
                <h3 className="m-0 font-display text-lg tracking-tight">
                  Abrir «{selected.name}» con
                </h3>
                <button
                  type="button"
                  className="grid size-8 cursor-pointer place-items-center rounded-full border-0 bg-transparent text-muted hover:bg-accent-soft hover:text-ink"
                  onClick={() => setModal(null)}
                  aria-label="Cerrar"
                >
                  <X className="size-4" strokeWidth={1.8} />
                </button>
              </div>

              <div className="border-b border-line px-4 py-2.5">
                <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2">
                  <Search className="size-4 shrink-0 text-muted" />
                  <input
                    className="min-w-0 flex-1 border-0 bg-transparent text-sm text-ink outline-none placeholder:text-muted"
                    placeholder="Buscar programa…"
                    value={openWithQuery}
                    onChange={(e) => setOpenWithQuery(e.target.value)}
                    autoFocus
                  />
                </div>
              </div>

              <div className={`min-h-0 flex-1 overflow-auto p-1.5 ${hideScrollbar}`}>
                {openWithLoading ? (
                  <div className="grid place-items-center gap-2 py-12 text-center">
                    <LoaderCircle className="size-6 animate-spin text-muted" />
                    <p className="m-0 text-sm text-muted">Cargando programas…</p>
                  </div>
                ) : openWithApps.length === 0 ? (
                  <div className="grid place-items-center gap-2 py-12 text-center">
                    <AppWindow className="size-8 text-muted opacity-40" strokeWidth={1.5} />
                    <p className="m-0 text-sm text-muted">No se encontraron programas</p>
                  </div>
                ) : (
                  (() => {
                    const q = openWithQuery.trim().toLowerCase();
                    const filtered = q
                      ? openWithApps.filter(
                          (app) =>
                            app.name.toLowerCase().includes(q) ||
                            app.path.toLowerCase().includes(q),
                        )
                      : openWithApps;
                    if (filtered.length === 0 && q) {
                      return (
                        <div className="grid place-items-center gap-2 py-12 text-center">
                          <Search className="size-8 text-muted opacity-40" />
                          <p className="m-0 text-sm text-muted">Sin resultados</p>
                        </div>
                      );
                    }
                    return filtered.map((app) => (
                      <button
                        key={app.path}
                        type="button"
                        onClick={() => {
                          void openWithApp(app.path, selected.path)
                            .then(() => {
                              setModal(null);
                              flash(`Abierto con ${app.name}`);
                            })
                            .catch((e) => flash(String(e)));
                        }}
                        className="flex w-full cursor-pointer items-center gap-3 rounded-xl border-0 bg-transparent px-2.5 py-2.5 text-left hover:bg-accent-soft"
                      >
                        <ProgramIcon path={app.path} className="size-9" defer />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-ink">
                            {app.name}
                          </div>
                          <div className="truncate text-[11px] text-muted" title={app.path}>
                            {app.path}
                          </div>
                        </div>
                        <ArrowUpCircle className="size-4 shrink-0 text-muted opacity-50" />
                      </button>
                    ));
                  })()
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}

      {modal === "rename" &&
        selected &&
        createPortal(
          <EditShortcutModal
            key={selected.id}
            item={selected}
            busy={busy}
            onClose={() => setModal(null)}
            onSave={async ({ name, kind, iconDataUrl, iconCustom, iconAvatar }) => {
              setBusy(true);
              try {
                if (name !== selected.name) {
                  await onRename(selected.id, name);
                }
                if (
                  !selected.isGroup &&
                  (selected.kind === "app" || selected.kind === "game") &&
                  kind !== selected.kind
                ) {
                  await onSetKind(selected.id, kind);
                }
                if (
                  !selected.isGroup &&
                  iconDataUrl &&
                  (iconDataUrl !== selected.iconDataUrl ||
                    Boolean(iconCustom) !== Boolean(selected.iconCustom))
                ) {
                  await onSetIcon(selected.id, iconDataUrl, {
                    custom: iconCustom,
                    avatar: iconAvatar,
                  });
                }
                setModal(null);
                flash("Guardado");
              } finally {
                setBusy(false);
              }
            }}
          />,
          document.body,
        )}

      {(modal === "add" ||
        modal === "url" ||
        modal === "programs" ||
        modal === "folder" ||
        modal === "move") && (
        <div className="fixed inset-0 z-30 grid place-items-center">
          <button
            type="button"
            className="absolute inset-0 border-0 bg-ink/28 backdrop-blur-[2px]"
            onClick={() => setModal(null)}
            aria-label="Cerrar"
          />
          <div
            className={[
              "relative z-31 animate-rise-fast rounded-[18px] border border-line bg-paper p-5 shadow-desk",
              modal === "programs"
                ? "flex max-h-[min(640px,calc(100vh-2rem))] w-[min(520px,calc(100vw-2rem))] flex-col"
                : "w-[min(420px,calc(100vw-2rem))]",
            ].join(" ")}
            role="dialog"
            aria-modal
          >
            {modal === "add" && (
              <>
                <h3 className="m-0 font-display text-xl tracking-tight">
                  Añadir
                </h3>
                <p className="mt-1 mb-4 text-sm text-muted">
                  {currentFolder
                    ? `Dentro de «${currentFolder.name}»`
                    : "¿Qué quieres poner en el escritorio?"}
                </p>

                <div className="mb-4">
                  <KindPicker value={draftKind} onChange={setDraftKind} />
                </div>

                <div className="flex flex-col gap-1.5">
                  <AddChoice
                    icon={<LayoutGrid className="size-5" strokeWidth={1.8} />}
                    title="Programa instalado"
                    hint="Elegir de los de tu PC"
                    onClick={() => void openProgramsPicker()}
                    disabled={busy}
                  />
                  <AddChoice
                    icon={<Plus className="size-5" strokeWidth={1.8} />}
                    title="Archivo o acceso"
                    hint="Exe, acceso directo…"
                    onClick={() => void pickFiles()}
                    disabled={busy}
                  />
                  {deskTab === "apps" && (
                    <AddChoice
                      icon={<FolderPlus className="size-5" strokeWidth={1.8} />}
                      title="Nueva carpeta"
                      hint="Organizar apps por categoría"
                      onClick={() => {
                        setDraftName("");
                        setModal("folder");
                      }}
                    />
                  )}
                  <AddChoice
                    icon={<Link2 className="size-5" strokeWidth={1.8} />}
                    title="Enlace web"
                    hint="Abrir una URL"
                    onClick={() => setModal("url")}
                  />
                </div>
              </>
            )}

            {modal === "folder" && (
              <form onSubmit={submitFolder}>
                <h3 className="m-0 font-display tracking-tight">Nueva carpeta</h3>
                <p className="mt-1 mb-1 text-sm text-muted">
                  Ej. Productividad, Diseño, Juegos…
                </p>
                <Field label="Nombre">
                  <input
                    className={fieldInput}
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    placeholder="Nombre"
                    autoFocus
                    required
                  />
                </Field>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" className={btnGhost} onClick={() => setModal("add")}>
                    Atrás
                  </button>
                  <button type="submit" className={btnPrimary}>
                    Crear
                  </button>
                </div>
                <button
                  type="button"
                  className="mt-3 w-full cursor-pointer border-0 bg-transparent text-center text-xs text-muted underline-offset-2 hover:text-ink hover:underline"
                  disabled={busy}
                  onClick={() => void pickFolder()}
                >
                  O elegir una carpeta del PC…
                </button>
              </form>
            )}

            {modal === "move" && selected && (
              <>
                <h3 className="m-0 font-display tracking-tight">Mover a carpeta</h3>
                <p className="mt-1 mb-3 text-sm text-muted">
                  Elige dónde poner «{selected.name}».
                </p>
                <div className="flex max-h-[280px] flex-col gap-1 overflow-auto">
                  <button
                    type="button"
                    className={btnGhost + " justify-start"}
                    onClick={() => {
                      void onMoveToFolder(selected.id, null).then(() => {
                        flash("Movido al escritorio");
                        setModal(null);
                      });
                    }}
                  >
                    Escritorio (raíz)
                  </button>
                  {allGroups
                    .filter((g) => g.id !== selected.id)
                    .map((g) => (
                      <button
                        key={g.id}
                        type="button"
                        className={btnGhost + " justify-start"}
                        onClick={() => {
                          void onMoveToFolder(selected.id, g.id).then(() => {
                            flash(`Movido a «${g.name}»`);
                            setModal(null);
                          });
                        }}
                      >
                        <FolderOpen className="size-4" strokeWidth={1.8} />
                        {g.name}
                      </button>
                    ))}
                  {allGroups.length === 0 && (
                    <p className="m-0 px-1 py-3 text-sm text-muted">
                      Aún no hay carpetas. Crea una desde Añadir.
                    </p>
                  )}
                </div>
                <div className="mt-4">
                  <button type="button" className={btnGhost} onClick={() => setModal(null)}>
                    Cancelar
                  </button>
                </div>
              </>
            )}

            {modal === "programs" && (
              <>
                <h3 className="m-0 font-display tracking-tight">Programas</h3>
                <p className="mt-1 mb-3 text-sm text-muted">
                  {installedScanning
                    ? "Cargando programas…"
                    : "Toca para seleccionar"}
                </p>
                <div className="relative mb-3">
                  <Search
                    className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted"
                    strokeWidth={1.8}
                  />
                  <input
                    className="w-full rounded-full border border-line bg-surface py-2.5 pr-3.5 pl-10 text-sm outline-none focus:border-accent/45"
                    value={installedQuery}
                    onChange={(e) => setInstalledQuery(e.target.value)}
                    placeholder="Buscar…"
                    autoFocus
                  />
                </div>
                <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-line bg-surface/50">
                  {installedLoading && installed.length === 0 ? (
                    <p className="m-0 px-4 py-8 text-center text-sm text-muted">
                      Buscando en el menú Inicio…
                    </p>
                  ) : filteredInstalled.length === 0 ? (
                    <p className="m-0 px-4 py-8 text-center text-sm text-muted">
                      {installedScanning
                        ? "Buscando…"
                        : `Sin resultados${installedQuery ? " para esa búsqueda" : ""}.`}
                    </p>
                  ) : (
                    <ul className="m-0 list-none p-1.5">
                      {filteredInstalled.map((app) => {
                        const checked = pickedPaths.has(app.path);
                        return (
                          <li key={app.path}>
                            <button
                              type="button"
                              className={[
                                "flex w-full cursor-pointer items-center gap-3 rounded-lg border-0 px-3 py-2.5 text-left transition-colors",
                                checked
                                  ? "bg-accent-soft text-accent-deep"
                                  : "bg-transparent text-ink hover:bg-paper",
                              ].join(" ")}
                              onClick={() => togglePicked(app.path)}
                            >
                              <span
                                className={[
                                  "grid size-4 shrink-0 place-items-center rounded border",
                                  checked
                                    ? "border-accent bg-accent text-[10px] text-white"
                                    : "border-line bg-paper",
                                ].join(" ")}
                                aria-hidden
                              >
                                {checked ? "✓" : ""}
                              </span>
                              <ProgramIcon
                                path={app.path}
                                className="size-9"
                                defer
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium">
                                  {app.name}
                                </span>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                      {installedScanning && (
                        <li className="px-3 py-2 text-center text-xs text-muted">
                          Cargando más…
                        </li>
                      )}
                    </ul>
                  )}
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className={btnGhost}
                    onClick={() => setModal("add")}
                    disabled={busy}
                  >
                    Atrás
                  </button>
                  <span className="mr-auto text-xs text-muted">
                    {pickedPaths.size
                      ? `${pickedPaths.size} elegidos`
                      : installedScanning
                        ? `${installed.length}…`
                        : `${filteredInstalled.length}`}
                  </span>
                  <button
                    type="button"
                    className={btnPrimary}
                    disabled={busy || !pickedPaths.size}
                    onClick={() => void addPickedPrograms()}
                  >
                    {busy ? "Añadiendo…" : "Añadir"}
                  </button>
                </div>
              </>
            )}

            {modal === "url" && (
              <form onSubmit={submitUrl}>
                <h3 className="m-0 font-display tracking-tight">Añadir enlace</h3>
                <Field label="Nombre">
                  <input
                    className={fieldInput}
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    placeholder="Opcional"
                  />
                </Field>
                <Field label="URL">
                  <input
                    className={fieldInput}
                    value={draftUrl}
                    onChange={(e) => setDraftUrl(e.target.value)}
                    placeholder="https://…"
                    required
                    autoFocus
                  />
                </Field>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" className={btnGhost} onClick={() => setModal("add")}>
                    Atrás
                  </button>
                  <button type="submit" className={btnPrimary}>
                    Guardar
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {toast && <div className={toastCls}>{toast}</div>}
    </section>
  );
}

const fieldInput =
  "rounded-xl border border-line bg-paper px-3 py-2.5 outline-none focus:border-accent/45 focus:shadow-[0_0_0_3px_var(--color-accent-soft)]";

function KindPicker({
  value,
  onChange,
}: {
  value: ItemKind;
  onChange: (kind: ItemKind) => void;
}) {
  const options = [
    {
      kind: "app" as const,
      label: "App",
      hint: "Programas y herramientas",
      icon: AppWindow,
      active:
        "border-accent bg-accent-soft text-accent-deep shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-accent)_35%,transparent)]",
    },
    {
      kind: "game" as const,
      label: "Juego",
      hint: "Videojuegos",
      icon: Gamepad2,
      active:
        "border-[#7c3aed] bg-[#7c3aed]/12 text-[#a78bfa] shadow-[inset_0_0_0_1px_rgba(124,58,237,0.35)]",
    },
  ];

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-ink">Tipo</span>
      <div className="grid grid-cols-2 gap-2">
        {options.map(({ kind, label, hint, icon: Icon, active }) => {
          const selected = value === kind;
          return (
            <button
              key={kind}
              type="button"
              className={[
                "flex cursor-pointer flex-col items-center gap-1.5 rounded-2xl border px-3 py-3.5 text-center transition",
                selected
                  ? active
                  : "border-line bg-surface text-muted hover:border-ink/20 hover:bg-paper hover:text-ink",
              ].join(" ")}
              onClick={() => onChange(kind)}
            >
              <Icon className="size-6" strokeWidth={1.8} />
              <span className="text-sm font-semibold">{label}</span>
              <span className="text-[11px] leading-tight opacity-80">{hint}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AddChoice({
  icon,
  title,
  hint,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-3 text-left transition hover:bg-paper disabled:cursor-not-allowed disabled:opacity-45"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-deep">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-ink">{title}</span>
        <span className="block text-xs text-muted">{hint}</span>
      </span>
    </button>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="mt-3.5 flex flex-col gap-1.5">
      <span className="text-sm text-muted">{label}</span>
      {children}
    </label>
  );
}

function CtxBtn({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "cursor-pointer rounded-[10px] border-0 bg-transparent px-2.5 py-2 text-left hover:bg-accent-soft",
        danger ? "text-danger" : "text-ink",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function LiveUsage({
  baseMs,
  segmentStart,
}: {
  baseMs: number;
  segmentStart: number | null;
}) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!segmentStart) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [segmentStart]);
  return <>{formatUsage(liveUsageMs(baseMs, segmentStart))}</>;
}
