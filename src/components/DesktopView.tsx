import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  AppWindow,
  FolderOpen,
  Gamepad2,
  Link2,
  Plus,
  Search,
} from "lucide-react";
import type { ItemKind, ShortcutItem } from "../types";
import { KIND_LABELS } from "../types";
import { launchItem, revealItem } from "../lib/tauri";
import { btnGhost, btnPrimary, searchBox, toast as toastCls } from "../lib/ui";
import { ShortcutTile } from "./ShortcutTile";

interface Props {
  items: ShortcutItem[];
  onAddPath: (
    path: string,
    kind?: ItemKind,
    name?: string,
  ) => Promise<unknown>;
  onAddUrl: (url: string, name?: string) => Promise<unknown>;
  onRename: (id: string, name: string) => Promise<void>;
  onSetKind: (id: string, kind: ItemKind) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onReorder: (fromId: string, toId: string) => Promise<void>;
}

type ModalMode = null | "add" | "url" | "rename" | "menu";

function Section({
  title,
  icon,
  items,
  selectedId,
  onSelect,
  onOpen,
  onContext,
  dragId,
  onReorder,
}: {
  title: string;
  icon: React.ReactNode;
  items: ShortcutItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onOpen: (item: ShortcutItem) => void;
  onContext: (item: ShortcutItem, e: React.MouseEvent) => void;
  dragId: React.MutableRefObject<string | null>;
  onReorder: (fromId: string, toId: string) => Promise<void>;
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
            onSelect={() => onSelect(item.id)}
            onOpen={() => onOpen(item)}
            onContext={(e) => onContext(item, e)}
            onDragStart={() => {
              dragId.current = item.id;
            }}
            onDrop={() => {
              if (dragId.current && dragId.current !== item.id) {
                void onReorder(dragId.current, item.id);
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
  onAddPath,
  onAddUrl,
  onRename,
  onSetKind,
  onRemove,
  onReorder,
}: Props) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalMode>(null);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const [draftName, setDraftName] = useState("");
  const [draftUrl, setDraftUrl] = useState("");
  const [draftKind, setDraftKind] = useState<ItemKind>("app");
  const [busy, setBusy] = useState(false);
  const [dropping, setDropping] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const dragId = useRef<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.path.toLowerCase().includes(q) ||
        i.kind.includes(q),
    );
  }, [items, query]);

  const apps = useMemo(
    () => filtered.filter((i) => i.kind === "app"),
    [filtered],
  );
  const games = useMemo(
    () => filtered.filter((i) => i.kind === "game"),
    [filtered],
  );
  const others = useMemo(
    () => filtered.filter((i) => i.kind !== "app" && i.kind !== "game"),
    [filtered],
  );

  const selected = items.find((i) => i.id === selectedId) ?? null;

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
          await onAddPath(path);
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
  }, [onAddPath]);

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
        await onAddPath(path, draftKind);
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
        await onAddPath(result, "folder");
        flash("Carpeta añadida");
        setModal(null);
      }
    } finally {
      setBusy(false);
    }
  }

  async function submitUrl(e: React.FormEvent) {
    e.preventDefault();
    if (!draftUrl.trim()) return;
    const url = /^https?:\/\//i.test(draftUrl)
      ? draftUrl.trim()
      : `https://${draftUrl.trim()}`;
    await onAddUrl(url, draftName || undefined);
    setDraftUrl("");
    setDraftName("");
    setModal(null);
    flash("URL añadida");
  }

  async function submitRename(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    await onRename(selected.id, draftName);
    setModal(null);
  }

  async function openSelected(item = selected) {
    if (!item) return;
    try {
      await launchItem(item.path);
    } catch (err) {
      flash(String(err));
    }
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
          <p className="m-0 bg-linear-to-br from-zinc-700 via-zinc-800 to-zinc-950 bg-clip-text font-display text-[clamp(2.6rem,6vw,4.2rem)] font-extrabold tracking-tighter text-transparent">
            DeskAll
          </p>
          <h2 className="m-0 font-display text-[1.45rem] tracking-tight">
            Tu escritorio empieza aquí
          </h2>
          <p className="mb-2 max-w-md text-ink-soft leading-relaxed">
            Arrastra accesos directos del Escritorio. Se organizan en Apps y
            Juegos con sus iconos reales.
          </p>
          <button type="button" className={btnPrimary} onClick={() => setModal("add")}>
            <Plus className="size-4" strokeWidth={1.8} />
            Añadir acceso
          </button>
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-7 overflow-auto px-0.5 pb-4">
          <Section
            title="Apps"
            icon={<AppWindow className="size-4" strokeWidth={1.8} />}
            items={apps}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onOpen={(item) => void openSelected(item)}
            onContext={openContext}
            dragId={dragId}
            onReorder={onReorder}
          />
          <Section
            title="Juegos"
            icon={<Gamepad2 className="size-4" strokeWidth={1.8} />}
            items={games}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onOpen={(item) => void openSelected(item)}
            onContext={openContext}
            dragId={dragId}
            onReorder={onReorder}
          />
          <Section
            title="Otros"
            icon={<FolderOpen className="size-4" strokeWidth={1.8} />}
            items={others}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onOpen={(item) => void openSelected(item)}
            onContext={openContext}
            dragId={dragId}
            onReorder={onReorder}
          />
        </div>
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
              <CtxBtn onClick={() => void openSelected(selected)}>Abrir</CtxBtn>
              <CtxBtn
                onClick={() => {
                  setDraftName(selected.name);
                  setModal("rename");
                }}
              >
                Renombrar
              </CtxBtn>
              {selected.kind !== "app" && (
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
              {selected.kind !== "game" && (
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
              <CtxBtn
                onClick={() =>
                  void revealItem(selected.path).catch((e) => flash(String(e)))
                }
              >
                Mostrar en librería
              </CtxBtn>
              <CtxBtn
                danger
                onClick={() => {
                  void onRemove(selected.id);
                  setSelectedId(null);
                  setModal(null);
                }}
              >
                Quitar de DeskAll
              </CtxBtn>
            </div>
          </>,
          document.body,
        )}

      {(modal === "add" || modal === "url" || modal === "rename") && (
        <div className="fixed inset-0 z-30 grid place-items-center">
          <button
            type="button"
            className="absolute inset-0 border-0 bg-ink/28 backdrop-blur-[2px]"
            onClick={() => setModal(null)}
            aria-label="Cerrar"
          />
          <div
            className="relative z-31 w-[min(420px,calc(100vw-2rem))] animate-rise-fast rounded-[18px] border border-line bg-paper p-5 shadow-desk"
            role="dialog"
            aria-modal
          >
            {modal === "add" && (
              <>
                <h3 className="m-0 font-display tracking-tight">Añadir al escritorio</h3>
                <p className="mt-1 mb-4 text-sm text-muted">
                  Elige si es App o Juego. Se extraerá el icono del archivo.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {(Object.keys(KIND_LABELS) as ItemKind[])
                    .filter((k) => k !== "url")
                    .map((kind) => (
                      <button
                        key={kind}
                        type="button"
                        className={[
                          "cursor-pointer rounded-full border px-3 py-1.5",
                          draftKind === kind
                            ? "border-accent/35 bg-accent-soft text-accent-deep"
                            : "border-line bg-surface text-ink-soft",
                        ].join(" ")}
                        onClick={() => setDraftKind(kind)}
                      >
                        {KIND_LABELS[kind]}
                      </button>
                    ))}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={btnPrimary}
                    disabled={busy}
                    onClick={() => void pickFiles()}
                  >
                    Elegir archivo / acceso
                  </button>
                  <button
                    type="button"
                    className={btnGhost}
                    disabled={busy}
                    onClick={() => void pickFolder()}
                  >
                    <FolderOpen className="size-4" strokeWidth={1.8} />
                    Carpeta
                  </button>
                  <button type="button" className={btnGhost} onClick={() => setModal("url")}>
                    <Link2 className="size-4" strokeWidth={1.8} />
                    URL
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

            {modal === "rename" && (
              <form onSubmit={submitRename}>
                <h3 className="m-0 font-display tracking-tight">Renombrar</h3>
                <Field label="Nombre">
                  <input
                    className={fieldInput}
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    autoFocus
                    required
                  />
                </Field>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" className={btnGhost} onClick={() => setModal(null)}>
                    Cancelar
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
