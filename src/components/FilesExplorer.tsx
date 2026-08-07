import { useMemo } from "react";
import {
  FileText,
  Folder,
  FolderOpen,
  Globe,
  Plus,
  Search,
} from "./icons";
import type { ShortcutItem } from "../types";
import { KIND_LABELS } from "../types";
import { FitIcon } from "./FitIcon";
import { btnPrimary, hideScrollbar } from "../lib/ui";

function formatDate(ms: number): string {
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ms));
}

function kindLabel(item: ShortcutItem): string {
  if (item.kind === "folder") return "Carpeta";
  if (item.kind === "url") return "Enlace";
  const ext = item.path.split(".").pop();
  if (ext && ext !== item.path && ext.length <= 8) {
    return `.${ext.toLowerCase()}`;
  }
  return KIND_LABELS[item.kind] ?? "Archivo";
}

interface Props {
  items: ShortcutItem[];
  query?: string;
  selectedId: string | null;
  launchingId?: string | null;
  onSelect: (id: string) => void;
  onOpen: (item: ShortcutItem) => void;
  onContext: (item: ShortcutItem, e: React.MouseEvent) => void;
  onAdd: () => void;
}

export function FilesExplorer({
  items,
  query = "",
  selectedId,
  launchingId,
  onSelect,
  onOpen,
  onContext,
  onAdd,
}: Props) {
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = [...items].sort((a, b) => {
      const aFolder = a.kind === "folder" ? 0 : 1;
      const bFolder = b.kind === "folder" ? 0 : 1;
      if (aFolder !== bFolder) return aFolder - bFolder;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
    if (!q) return list;
    return list.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.path.toLowerCase().includes(q) ||
        i.kind.includes(q),
    );
  }, [items, query]);

  if (items.length === 0) {
    return (
      <div className="grid flex-1 place-content-center justify-items-center gap-3 rounded-2xl border border-dashed border-line bg-surface/40 p-10 text-center">
        <FolderOpen className="size-10 text-muted opacity-60" />
        <h2 className="m-0 font-display text-xl tracking-tight">Sin archivos</h2>
        <p className="m-0 max-w-sm text-sm text-muted">
          Arrastra archivos o carpetas aquí, o usa Añadir. Solo se muestran los
          guardados en DeskAll.
        </p>
        <button type="button" className={btnPrimary} onClick={onAdd}>
          <Plus className="size-4" />
          Añadir
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-surface/60">
      <div className="grid grid-cols-[minmax(0,1fr)_100px_160px] gap-2 border-b border-line px-3 py-2 text-[10px] font-semibold tracking-wide text-muted uppercase sm:grid-cols-[minmax(0,1fr)_110px_170px]">
        <span>Nombre</span>
        <span>Tipo</span>
        <span className="text-right">Añadido</span>
      </div>

      <div className={`min-h-0 flex-1 overflow-auto p-1.5 ${hideScrollbar}`}>
        {filtered.length === 0 ? (
          <div className="grid place-items-center gap-2 p-10 text-center">
            <Search className="size-8 text-muted opacity-50" />
            <p className="m-0 text-sm text-muted">Nada coincide con la búsqueda.</p>
          </div>
        ) : (
          <ul className="m-0 list-none p-0">
            {filtered.map((item) => {
              const active = selectedId === item.id;
              const launching = launchingId === item.id;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(item.id)}
                    onDoubleClick={() => onOpen(item)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      onSelect(item.id);
                      onContext(item, e);
                    }}
                    draggable={false}
                    className={[
                      "grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_100px_160px] items-center gap-2 rounded-xl border-0 px-2.5 py-2 text-left transition sm:grid-cols-[minmax(0,1fr)_110px_170px]",
                      active
                        ? "bg-accent-soft text-ink"
                        : "bg-transparent text-ink hover:bg-paper/80",
                      launching ? "opacity-70" : "",
                    ].join(" ")}
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      {item.iconDataUrl ? (
                        <FitIcon
                          src={item.iconDataUrl}
                          className="size-8 shrink-0"
                          size={64}
                        />
                      ) : (
                        <span
                          className="grid size-8 shrink-0 place-items-center rounded-lg text-white"
                          style={{ background: item.color }}
                        >
                          {item.kind === "folder" ? (
                            <Folder className="size-4" />
                          ) : item.kind === "url" ? (
                            <Globe className="size-4" />
                          ) : (
                            <FileText className="size-4" />
                          )}
                        </span>
                      )}
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {item.name}
                        </span>
                        <span
                          className="block truncate font-mono text-[11px] text-muted"
                          title={item.path}
                        >
                          {item.path}
                        </span>
                      </span>
                    </span>
                    <span className="truncate text-xs text-muted">
                      {kindLabel(item)}
                    </span>
                    <span className="truncate text-right text-xs text-muted">
                      {formatDate(item.createdAt)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <footer className="flex items-center justify-between gap-2 border-t border-line px-3 py-2 text-[11px] text-muted">
        <span>
          {filtered.length} archivo{filtered.length === 1 ? "" : "s"} en DeskAll
          {query.trim() ? " (filtrados)" : ""}
        </span>
        <span>Doble clic para abrir · clic derecho para opciones</span>
      </footer>
    </div>
  );
}
