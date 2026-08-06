import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  AppWindow,
  ChevronLeft,
  Clock3,
  ExternalLink,
  FolderPlus,
  FolderOpen,
  Gamepad2,
  LayoutGrid,
  Link2,
  Pencil,
  Plus,
  Search,
  X,
} from "lucide-react";
import type { ItemKind, ShortcutItem } from "../types";
import { KIND_LABELS } from "../types";
import {
  launchItem,
  listFileIcons,
  listInstalledApps,
  revealItem,
  scanInstalledApps,
  type InstalledApp,
} from "../lib/tauri";
import { formatUsage, liveUsageMs } from "../lib/usage";
import { btnGhost, btnPrimary, searchBox, toast as toastCls } from "../lib/ui";
import { ShortcutTile } from "./ShortcutTile";
import { ProgramIcon } from "./ProgramIcon";
import { FitIcon } from "./FitIcon";

interface Props {
  items: ShortcutItem[];
  activeUsageId?: string | null;
  activeSegmentStart?: number | null;
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
  onAddGroup: (name: string, parentId?: string | null) => Promise<unknown>;
  onMoveToFolder: (id: string, parentId: string | null) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onSetIcon: (id: string, iconDataUrl: string | null) => Promise<void>;
  onSetKind: (id: string, kind: ItemKind) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onReorder: (fromId: string, toId: string) => Promise<void>;
  onUsageStart: (id: string) => void;
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
  | "move";

function Section({
  title,
  icon,
  items,
  selectedId,
  launchingId,
  activeUsageId,
  childCountOf,
  onSelect,
  onOpen,
  onContext,
  dragId,
  onDropItem,
}: {
  title: string;
  icon: React.ReactNode;
  items: ShortcutItem[];
  selectedId: string | null;
  launchingId: string | null;
  activeUsageId: string | null;
  childCountOf: (id: string) => number;
  onSelect: (id: string) => void;
  onOpen: (item: ShortcutItem) => void;
  onContext: (item: ShortcutItem, e: React.MouseEvent) => void;
  dragId: React.MutableRefObject<string | null>;
  onDropItem: (fromId: string, toItem: ShortcutItem) => void;
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
            active={item.id === activeUsageId}
            childCount={childCountOf(item.id)}
            onSelect={() => onSelect(item.id)}
            onOpen={() => onOpen(item)}
            onContext={(e) => onContext(item, e)}
            onDragStart={() => {
              dragId.current = item.id;
            }}
            onDrop={() => {
              if (dragId.current && dragId.current !== item.id) {
                onDropItem(dragId.current, item);
              }
              dragId.current = null;
            }}
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
  onAddPath,
  onAddUrl,
  onAddGroup,
  onMoveToFolder,
  onRename,
  onSetIcon,
  onSetKind,
  onRemove,
  onReorder,
  onUsageStart,
}: Props) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalMode>(null);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const [draftName, setDraftName] = useState("");
  const [draftUrl, setDraftUrl] = useState("");
  const [draftKind, setDraftKind] = useState<ItemKind>("app");
  const [draftIcon, setDraftIcon] = useState<string | null>(null);
  const [iconChoices, setIconChoices] = useState<string[]>([]);
  const [iconsLoading, setIconsLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dropping, setDropping] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const [installed, setInstalled] = useState<InstalledApp[]>([]);
  const [installedQuery, setInstalledQuery] = useState("");
  const [installedLoading, setInstalledLoading] = useState(false);
  const [installedScanning, setInstalledScanning] = useState(false);
  const [pickedPaths, setPickedPaths] = useState<Set<string>>(() => new Set());
  const scanGen = useRef(0);
  const dragId = useRef<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const clickTimer = useRef<number | null>(null);

  const currentFolder = folderId
    ? (items.find((i) => i.id === folderId && i.isGroup) ?? null)
    : null;

  // If folder was deleted, go back to root
  useEffect(() => {
    if (folderId && !items.some((i) => i.id === folderId && i.isGroup)) {
      setFolderId(null);
    }
  }, [folderId, items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const atLevel = items.filter((i) => (i.parentId ?? null) === folderId);
    if (!q) return atLevel;
    // Search within current folder; at root also match nested names lightly
    return atLevel.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.path.toLowerCase().includes(q) ||
        i.kind.includes(q),
    );
  }, [items, query, folderId]);

  const groups = useMemo(
    () => filtered.filter((i) => i.isGroup),
    [filtered],
  );
  const apps = useMemo(
    () => filtered.filter((i) => !i.isGroup && i.kind === "app"),
    [filtered],
  );
  const games = useMemo(
    () => filtered.filter((i) => !i.isGroup && i.kind === "game"),
    [filtered],
  );
  const others = useMemo(
    () =>
      filtered.filter(
        (i) => !i.isGroup && i.kind !== "app" && i.kind !== "game",
      ),
    [filtered],
  );

  const allGroups = useMemo(
    () => items.filter((i) => i.isGroup),
    [items],
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
          await onAddPath(path, undefined, undefined, folderId);
          added += 1;
        } catch (err) {
          flash(String(err));
        }
      }
      if (added) flash(`${added} guardado(s) en librería interna`);
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, [onAddPath, folderId]);

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
    await onAddGroup(name, folderId);
    setDraftName("");
    setModal(null);
    flash(`Carpeta «${name}» creada`);
  }

  async function submitRename(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setBusy(true);
    try {
      await onRename(selected.id, draftName);
      if (!selected.isGroup) {
        if (draftKind !== selected.kind) {
          await onSetKind(selected.id, draftKind);
        }
        if (draftIcon && draftIcon !== selected.iconDataUrl) {
          await onSetIcon(selected.id, draftIcon);
        }
      }
      setModal(null);
      flash("Guardado");
    } finally {
      setBusy(false);
    }
  }

  async function openEdit(item: ShortcutItem) {
    setSelectedId(item.id);
    setDraftName(item.name);
    setDraftKind(
      item.kind === "game" ? "game" : item.kind === "app" ? "app" : item.kind,
    );
    setDraftIcon(item.iconDataUrl ?? null);
    setIconChoices(item.iconDataUrl ? [item.iconDataUrl] : []);
    setModal("rename");
    if (item.isGroup || item.path.startsWith("deskall://") || item.kind === "url") {
      return;
    }
    setIconsLoading(true);
    try {
      const icons = await listFileIcons(item.path);
      if (icons.length) {
        setIconChoices(icons);
        if (!item.iconDataUrl) setDraftIcon(icons[0] ?? null);
      }
    } catch {
      /* keep current */
    } finally {
      setIconsLoading(false);
    }
  }

  function handleDropItem(fromId: string, toItem: ShortcutItem) {
    if (toItem.isGroup) {
      void onMoveToFolder(fromId, toItem.id).then(() =>
        flash(`Movido a «${toItem.name}»`),
      );
      return;
    }
    void onReorder(fromId, toItem.id);
  }

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
      setModal("preview");
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
        "relative flex h-full flex-col gap-4 rounded-2xl transition",
        dropping
          ? "bg-accent-soft/40 ring-2 ring-accent ring-offset-2 ring-offset-transparent"
          : "",
      ].join(" ")}
    >
      {dropping && (
        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-2xl border-2 border-dashed border-accent bg-accent-soft/50 backdrop-blur-[1px]">
          <p className="font-display text-lg text-accent-deep">
            Suelta aquí para añadir al escritorio
          </p>
        </div>
      )}

      <header className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {currentFolder && (
            <div className="flex items-center gap-1.5 px-0.5">
              <button
                type="button"
                className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-1 text-xs text-ink-soft"
                onClick={() => setFolderId(null)}
              >
                <ChevronLeft className="size-3.5" strokeWidth={1.8} />
                Escritorio
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
              placeholder="Buscar apps, juegos, carpetas…"
              aria-label="Buscar"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className={btnGhost} onClick={() => setModal("add")}>
            <Plus className="size-4" strokeWidth={1.8} />
            Añadir
          </button>
          <button
            type="button"
            className={btnPrimary}
            onClick={() => openSelected()}
            disabled={!selected}
          >
            Abrir
          </button>
        </div>
      </header>

      {filtered.length === 0 ? (
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
                  onClick={() => setModal("add")}
                >
                  <Plus className="size-4" strokeWidth={1.8} />
                  Añadir
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="m-0 bg-linear-to-br from-zinc-700 via-zinc-800 to-zinc-950 bg-clip-text font-display text-[clamp(2.6rem,6vw,4.2rem)] font-extrabold tracking-tighter text-transparent">
                DeskAll
              </p>
              <h2 className="m-0 font-display text-[1.45rem] tracking-tight">
                Tu escritorio empieza aquí
              </h2>
              <p className="mb-2 max-w-md text-ink-soft leading-relaxed">
                Arrastra accesos, crea carpetas de categoría y organiza Apps y
                Juegos con sus iconos reales.
              </p>
              <button type="button" className={btnPrimary} onClick={() => setModal("add")}>
                <Plus className="size-4" strokeWidth={1.8} />
                Añadir acceso
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-7 overflow-auto px-2 pb-4">
          <Section
            title="Carpetas"
            icon={<FolderOpen className="size-4" strokeWidth={1.8} />}
            items={groups}
            selectedId={selectedId}
            launchingId={launchingId}
            activeUsageId={activeUsageId}
            childCountOf={childCountOf}
            onSelect={handleTileClick}
            onOpen={handleTileOpen}
            onContext={openContext}
            dragId={dragId}
            onDropItem={handleDropItem}
          />
          <Section
            title="Apps"
            icon={<AppWindow className="size-4" strokeWidth={1.8} />}
            items={apps}
            selectedId={selectedId}
            launchingId={launchingId}
            activeUsageId={activeUsageId}
            childCountOf={childCountOf}
            onSelect={handleTileClick}
            onOpen={handleTileOpen}
            onContext={openContext}
            dragId={dragId}
            onDropItem={handleDropItem}
          />
          <Section
            title="Juegos"
            icon={<Gamepad2 className="size-4" strokeWidth={1.8} />}
            items={games}
            selectedId={selectedId}
            launchingId={launchingId}
            activeUsageId={activeUsageId}
            childCountOf={childCountOf}
            onSelect={handleTileClick}
            onOpen={handleTileOpen}
            onContext={openContext}
            dragId={dragId}
            onDropItem={handleDropItem}
          />
          <Section
            title="Otros"
            icon={<FolderOpen className="size-4" strokeWidth={1.8} />}
            items={others}
            selectedId={selectedId}
            launchingId={launchingId}
            activeUsageId={activeUsageId}
            childCountOf={childCountOf}
            onSelect={handleTileClick}
            onOpen={handleTileOpen}
            onContext={openContext}
            dragId={dragId}
            onDropItem={handleDropItem}
          />
        </div>
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
                  {activeUsageId === selected.id && (
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
                    {!selected.isGroup && activeUsageId === selected.id
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
              {!selected.isGroup && (
                <CtxBtn onClick={() => setModal("move")}>
                  Mover a carpeta…
                </CtxBtn>
              )}
              {!selected.isGroup && selected.kind !== "app" && (
                <CtxBtn
                  onClick={() => {
                    void onSetKind(selected.id, "app");
                    setModal(null);
                    flash("Movido a Apps");
                  }}
                >
                  Mover a Apps
                </CtxBtn>
              )}
              {!selected.isGroup && selected.kind !== "game" && (
                <CtxBtn
                  onClick={() => {
                    void onSetKind(selected.id, "game");
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

      {(modal === "add" ||
        modal === "url" ||
        modal === "rename" ||
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
                : modal === "rename"
                  ? "flex max-h-[min(640px,calc(100vh-2rem))] w-[min(440px,calc(100vw-2rem))] flex-col"
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

                <div className="mb-4 flex gap-1 rounded-full border border-line bg-surface p-1">
                  {(
                    [
                      ["app", "App"],
                      ["game", "Juego"],
                    ] as const
                  ).map(([kind, label]) => (
                    <button
                      key={kind}
                      type="button"
                      className={[
                        "flex-1 cursor-pointer rounded-full border-0 px-3 py-1.5 text-sm transition",
                        draftKind === kind
                          ? "bg-paper text-ink shadow-sm"
                          : "bg-transparent text-muted",
                      ].join(" ")}
                      onClick={() => setDraftKind(kind)}
                    >
                      {label}
                    </button>
                  ))}
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
                  <AddChoice
                    icon={<FolderPlus className="size-5" strokeWidth={1.8} />}
                    title="Nueva carpeta"
                    hint="Organizar por categoría"
                    onClick={() => {
                      setDraftName("");
                      setModal("folder");
                    }}
                  />
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

            {modal === "rename" && selected && (
              <form onSubmit={submitRename} className="flex min-h-0 flex-col">
                <h3 className="m-0 font-display tracking-tight">Editar</h3>
                <Field label="Nombre">
                  <input
                    className={fieldInput}
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    autoFocus
                    required
                  />
                </Field>

                {!selected.isGroup &&
                  (selected.kind === "app" || selected.kind === "game") && (
                    <div className="mt-3.5 flex gap-1 rounded-full border border-line bg-surface p-1">
                      {(
                        [
                          ["app", "App"],
                          ["game", "Juego"],
                        ] as const
                      ).map(([kind, label]) => (
                        <button
                          key={kind}
                          type="button"
                          className={[
                            "flex-1 cursor-pointer rounded-full border-0 px-3 py-1.5 text-sm transition",
                            draftKind === kind
                              ? "bg-paper text-ink shadow-sm"
                              : "bg-transparent text-muted",
                          ].join(" ")}
                          onClick={() => setDraftKind(kind)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}

                {!selected.isGroup && selected.kind !== "url" && (
                  <div className="mt-3.5 flex min-h-0 flex-col gap-1.5">
                    <span className="text-sm text-muted">Icono</span>
                    {iconsLoading ? (
                      <p className="m-0 text-xs text-muted">Cargando iconos…</p>
                    ) : iconChoices.length === 0 ? (
                      <p className="m-0 text-xs text-muted">
                        No se encontraron iconos en el archivo.
                      </p>
                    ) : (
                      <div className="grid max-h-[200px] grid-cols-5 gap-2 overflow-auto rounded-xl border border-line bg-surface/50 p-2">
                        {iconChoices.map((icon, idx) => {
                          const active = draftIcon === icon;
                          return (
                            <button
                              key={`${idx}-${icon.length}`}
                              type="button"
                              className={[
                                "grid aspect-square cursor-pointer place-items-center rounded-xl border p-1.5 transition",
                                active
                                  ? "border-accent bg-accent-soft"
                                  : "border-transparent bg-paper hover:border-line",
                              ].join(" ")}
                              onClick={() => setDraftIcon(icon)}
                              title={`Icono ${idx + 1}`}
                            >
                              <img
                                src={icon}
                                alt=""
                                className="size-full object-contain"
                                draggable={false}
                              />
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={btnGhost}
                    onClick={() => setModal(null)}
                    disabled={busy}
                  >
                    Cancelar
                  </button>
                  <button type="submit" className={btnPrimary} disabled={busy}>
                    {busy ? "Guardando…" : "Guardar"}
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
