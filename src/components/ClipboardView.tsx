import { useMemo, useState } from "react";
import {
  Clipboard,
  FolderOpen,
  Image as ImageIcon,
  Pin,
  PinOff,
  Search,
  Trash2,
  Type,
  X,
} from "./icons";
import type { ClipboardEntry } from "../types";
import {
  formatTime,
  openClipboardLocation,
  truncate,
} from "../lib/tauri";
import { btnGhost, searchBox, toast as toastCls } from "../lib/ui";

interface Props {
  entries: ClipboardEntry[];
  watching: boolean;
  onWatchingChange: (v: boolean) => void;
  onCopy: (entry: ClipboardEntry) => Promise<void>;
  onTogglePin: (id: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onClear: () => Promise<void>;
}

export function ClipboardView({
  entries,
  watching,
  onWatchingChange,
  onCopy,
  onTogglePin,
  onRemove,
  onClear,
}: Props) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "text" | "image">("all");
  const [toast, setToast] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (filter !== "all" && e.kind !== filter) return false;
      if (!q) return true;
      if (e.kind === "text") return (e.text ?? "").toLowerCase().includes(q);
      return "imagen".includes(q) || "image".includes(q);
    });
  }, [entries, query, filter]);

  const pinned = useMemo(() => filtered.filter((e) => e.pinned), [filtered]);
  const rest = useMemo(() => filtered.filter((e) => !e.pinned), [filtered]);

  async function handleCopy(entry: ClipboardEntry) {
    try {
      await onCopy(entry);
      setToast(entry.kind === "image" ? "Imagen copiada" : "Texto copiado");
    } catch (err) {
      setToast(`Error al copiar: ${String(err)}`);
    }
    window.setTimeout(() => setToast(null), 1800);
  }

  async function handleOpenStore() {
    try {
      await openClipboardLocation({ kind: filter });
      setToast(
        filter === "image"
          ? "Carpeta de imágenes"
          : filter === "text"
            ? "Carpeta de textos"
            : "Carpeta del clipboard",
      );
    } catch (err) {
      setToast(`No se pudo abrir: ${String(err)}`);
    }
    window.setTimeout(() => setToast(null), 1800);
  }

  async function handleOpenEntry(entry: ClipboardEntry) {
    try {
      await openClipboardLocation({
        kind: entry.kind,
        filePath: entry.filePath,
      });
      setToast(
        entry.kind === "image" ? "Ubicación de imagen" : "Ubicación de texto",
      );
    } catch (err) {
      setToast(`No se pudo abrir: ${String(err)}`);
    }
    window.setTimeout(() => setToast(null), 1800);
  }

  return (
    <section className="relative flex h-full flex-col gap-4">
      <header className="flex flex-col items-stretch gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className={`${searchBox} max-w-none xl:max-w-[440px]`}>
          <Search className="size-4 shrink-0 text-muted" strokeWidth={1.8} />
          <input
            className="w-full border-0 bg-transparent text-ink outline-none"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar en el historial…"
            aria-label="Buscar clipboard"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-full border border-line bg-surface p-0.5">
            {(
              [
                { id: "all", label: "Todo", icon: Clipboard },
                { id: "text", label: "Texto", icon: Type },
                { id: "image", label: "Imágenes", icon: ImageIcon },
              ] as const
            ).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                className={[
                  "inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition",
                  filter === id
                    ? "bg-accent-soft text-accent-deep"
                    : "text-muted",
                ].join(" ")}
                onClick={() => setFilter(id)}
              >
                <Icon className="size-3.5" strokeWidth={1.8} />
                {label}
              </button>
            ))}
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={watching}
            onClick={() => onWatchingChange(!watching)}
            className={[
              "inline-flex cursor-pointer items-center gap-2.5 rounded-full border px-2.5 py-1.5 text-sm select-none transition",
              watching
                ? "border-ink/20 bg-ink text-paper"
                : "border-line bg-surface text-muted",
            ].join(" ")}
            title={watching ? "Captura activa" : "Captura pausada"}
          >
            <span
              className={[
                "relative h-5 w-9 rounded-full transition",
                watching ? "bg-paper/25" : "bg-ink/15",
              ].join(" ")}
            >
              <span
                className={[
                  "absolute top-0.5 size-4 rounded-full bg-paper shadow transition dark:bg-ink",
                  watching ? "left-4" : "left-0.5",
                ].join(" ")}
              />
            </span>
            <span className="pr-1 font-medium">Capturar</span>
          </button>

          <button
            type="button"
            className={btnGhost}
            onClick={() => void handleOpenStore()}
            title={
              filter === "image"
                ? "Abrir carpeta de imágenes"
                : filter === "text"
                  ? "Abrir carpeta de textos"
                  : "Abrir carpeta del clipboard"
            }
          >
            <FolderOpen className="size-4" strokeWidth={1.8} />
            Ubicación
          </button>

          <button type="button" className={btnGhost} onClick={() => void onClear()}>
            <Trash2 className="size-4" strokeWidth={1.8} />
            Limpiar
          </button>
        </div>
      </header>

      {filtered.length === 0 ? (
        <div className="grid flex-1 animate-rise place-content-center justify-items-center gap-2 p-8 text-center">
          <Clipboard className="size-10 text-accent" strokeWidth={1.5} />
          <h2 className="m-0 font-display text-[1.45rem] tracking-tight">
            Historial vacío
          </h2>
          <p className="m-0 max-w-md text-ink-soft leading-relaxed">
            Copia texto o imágenes en cualquier app. DeskAll guarda el historial
            para reutilizarlo al instante.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto pb-4 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {pinned.length > 0 && (
            <SectionHeader
              label="Fijados"
              count={pinned.length}
              icon={<Pin className="size-4" strokeWidth={1.8} />}
            />
          )}
          <ClipGrid
            items={pinned}
            onCopy={handleCopy}
            onOpenEntry={handleOpenEntry}
            onTogglePin={onTogglePin}
            onRemove={onRemove}
          />

          {rest.length > 0 && (
            <SectionHeader
              label="Recientes"
              count={rest.length}
              icon={<Clipboard className="size-4" strokeWidth={1.8} />}
              first={pinned.length === 0}
            />
          )}
          <ClipGrid
            items={rest}
            onCopy={handleCopy}
            onOpenEntry={handleOpenEntry}
            onTogglePin={onTogglePin}
            onRemove={onRemove}
          />
        </div>
      )}

      {toast && <div className={toastCls}>{toast}</div>}
    </section>
  );
}

function SectionHeader({
  label,
  count,
  icon,
  first = false,
}: {
  label: string;
  count: number;
  icon: React.ReactNode;
  first?: boolean;
}) {
  return (
    <header
      className={[
        "sticky top-0 z-10 flex items-center gap-2 bg-paper/85 px-1 py-2 backdrop-blur",
        first ? "" : "mt-5",
      ].join(" ")}
    >
      <span className="grid size-7 place-items-center rounded-lg bg-accent-soft text-accent-deep">
        {icon}
      </span>
      <h2 className="m-0 font-display text-base tracking-tight">{label}</h2>
      <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent-deep">
        {count}
      </span>
    </header>
  );
}

function ClipGrid({
  items,
  onCopy,
  onOpenEntry,
  onTogglePin,
  onRemove,
}: {
  items: ClipboardEntry[];
  onCopy: (entry: ClipboardEntry) => void;
  onOpenEntry: (entry: ClipboardEntry) => void;
  onTogglePin: (id: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  if (!items.length) return null;
  return (
    <div className="flex flex-col gap-3">
      {items.map((entry) => (
        <ClipRow
          key={entry.id}
          entry={entry}
          onCopy={() => onCopy(entry)}
          onOpenEntry={() => onOpenEntry(entry)}
          onTogglePin={() => void onTogglePin(entry.id)}
          onRemove={() => void onRemove(entry.id)}
        />
      ))}
    </div>
  );
}

function ClipRow({
  entry,
  onCopy,
  onOpenEntry,
  onTogglePin,
  onRemove,
}: {
  entry: ClipboardEntry;
  onCopy: () => void;
  onOpenEntry: () => void;
  onTogglePin: () => void;
  onRemove: () => void;
}) {
  const isImage = entry.kind === "image" && entry.imageDataUrl;

  return (
    <article
      className={[
        "group relative flex items-stretch overflow-hidden rounded-xl border transition duration-150 hover:-translate-y-px hover:shadow-desk",
        entry.pinned
          ? "border-ink/15 bg-accent-soft/60"
          : "border-line bg-surface",
      ].join(" ")}
    >
      <button
        type="button"
        onClick={onCopy}
        title="Clic para copiar de nuevo"
        className="flex min-w-0 flex-1 cursor-pointer items-stretch text-left"
      >
        <div
          className={[
            "relative grid h-28 w-36 shrink-0 place-items-center overflow-hidden border-r border-line",
            isImage ? "bg-ink/4 dark:bg-white/4" : "bg-ink/2 dark:bg-white/2",
          ].join(" ")}
        >
          {isImage ? (
            <img
              src={entry.imageDataUrl}
              alt="Imagen del portapapeles"
              className="size-full object-cover"
              loading="lazy"
            />
          ) : (
            <Type className="size-8 text-muted" strokeWidth={1.2} />
          )}
          {entry.pinned && (
            <span className="absolute top-2 left-2 grid size-6 place-items-center rounded-full bg-ink/85 text-paper dark:bg-paper dark:text-ink">
              <Pin className="size-3" strokeWidth={2} />
            </span>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 px-4 py-3">
          {isImage ? (
            <span className="text-sm font-medium text-ink">
              Imagen {entry.width ?? "?"}×{entry.height ?? "?"}
            </span>
          ) : (
            <p className="m-0 line-clamp-2 text-sm leading-snug text-ink">
              {truncate(entry.text ?? "", 220)}
            </p>
          )}
          <span className="flex items-center gap-1.5 text-xs text-muted">
            {isImage ? (
              <ImageIcon className="size-3.5" strokeWidth={1.8} />
            ) : (
              <Type className="size-3.5" strokeWidth={1.8} />
            )}
            {isImage
              ? `${entry.width ?? "?"}×${entry.height ?? "?"}`
              : `${(entry.text ?? "").length} caracteres`}
            <span>·</span>
            {formatTime(entry.createdAt)}
          </span>
        </div>
      </button>

      <div className="flex w-11 shrink-0 flex-col justify-center gap-0.5 border-l border-line bg-surface/50 px-1 py-1.5">
        <IconBtn
          title={
            entry.kind === "image"
              ? "Abrir ubicación de la imagen"
              : "Abrir ubicación del texto"
          }
          onClick={onOpenEntry}
        >
          <FolderOpen className="size-4" strokeWidth={1.8} />
        </IconBtn>
        <IconBtn
          title={entry.pinned ? "Desfijar" : "Fijar"}
          onClick={onTogglePin}
        >
          {entry.pinned ? (
            <PinOff className="size-4" strokeWidth={1.8} />
          ) : (
            <Pin className="size-4" strokeWidth={1.8} />
          )}
        </IconBtn>
        <IconBtn title="Eliminar" onClick={onRemove}>
          <X className="size-4" strokeWidth={1.8} />
        </IconBtn>
      </div>
    </article>
  );
}

function IconBtn({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="grid size-7 cursor-pointer place-items-center rounded-lg border-0 bg-transparent text-ink-soft hover:bg-accent-soft hover:text-accent-deep"
    >
      {children}
    </button>
  );
}
