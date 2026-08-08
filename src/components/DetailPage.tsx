import { useEffect, useState } from "react";
import type { FileDetails, ShortcutItem } from "../types";
import { KIND_LABELS } from "../types";
import {
  getFileDetails,
  launchItem,
  revealItem,
} from "../lib/tauri";
import { formatUsage, liveUsageMs } from "../lib/usage";
import { btnDanger, btnGhost, btnPrimary } from "../lib/ui";
import { FitIcon } from "./FitIcon";
import {
  AppWindow,
  ChevronLeft,
  Clock3,
  ExternalLink,
  FolderOpen,
  Gamepad2,
  Pencil,
  Star,
  Trash2,
} from "./icons";

function formatDate(ts?: number): string {
  if (!ts) return "—";
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ts * 1000));
}

function formatSize(bytes: number): string {
  if (bytes === 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
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

  const total = baseMs + liveUsageMs(0, segmentStart);
  return <>{formatUsage(total)}</>;
}

interface Props {
  item: ShortcutItem;
  running: boolean;
  activeUsageId: string | null;
  activeSegmentStart: number | null;
  onBack: () => void;
  onEdit: (item: ShortcutItem) => void;
  onRemove: (id: string) => void;
  onFavorite?: (id: string, favorite: boolean) => void;
  onUsageStart: (id: string) => void;
}

export function DetailPage({
  item,
  running,
  activeUsageId,
  activeSegmentStart,
  onBack,
  onEdit,
  onRemove,
  onFavorite,
  onUsageStart,
}: Props) {
  const [details, setDetails] = useState<FileDetails | null>(null);

  useEffect(() => {
    if (!item.isGroup && !item.path.startsWith("http")) {
      void getFileDetails(item.path).then(setDetails);
    }
  }, [item.path, item.isGroup]);

  const isActive = activeUsageId === item.id;

  return (
    <div className="flex h-full animate-rise-fast flex-col overflow-auto p-6">
      {/* Header */}
      <div className="mb-6 flex items-start gap-4">
        <button
          type="button"
          className={[
            btnGhost,
            "group h-10 shrink-0 rounded-xl px-3 shadow-sm hover:-translate-x-0.5 hover:border-accent/40 hover:bg-accent-soft hover:text-accent-deep",
          ].join(" ")}
          onClick={onBack}
          aria-label="Volver"
        >
          <ChevronLeft className="size-4 transition-transform group-hover:-translate-x-0.5" />
          <span className="text-sm font-semibold">Volver</span>
        </button>

        <div className="flex min-w-0 flex-1 items-center gap-4">
          {item.iconDataUrl ? (
            <FitIcon
              src={item.iconDataUrl}
              className="size-16 shrink-0 rounded-2xl"
              size={128}
            />
          ) : (
            <span
              className="grid size-16 shrink-0 place-items-center rounded-2xl text-white"
              style={{ background: item.color }}
            >
              {item.isGroup ? (
                <FolderOpen className="size-8" strokeWidth={1.6} />
              ) : item.kind === "game" ? (
                <Gamepad2 className="size-8" strokeWidth={1.6} />
              ) : (
                <AppWindow className="size-8" strokeWidth={1.6} />
              )}
            </span>
          )}

          <div className="min-w-0">
            <h1 className="m-0 truncate font-display text-2xl tracking-tight">
              {item.name}
            </h1>
            <div className="mt-1 flex items-center gap-2">
              <span className="rounded-lg bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent-deep">
                {item.isGroup ? "Carpeta DeskAll" : KIND_LABELS[item.kind]}
              </span>
              {running && (
                <span className="flex items-center gap-1 rounded-lg bg-[#22c55e]/15 px-2 py-0.5 text-xs font-medium text-[#22c55e]">
                  <span className="size-1.5 animate-pulse rounded-full bg-[#22c55e]" />
                  En uso
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="mb-6 flex flex-wrap gap-2">
        {!item.isGroup && (
          <button
            type="button"
            className={btnPrimary}
            onClick={() => {
              onUsageStart(item.id);
              void launchItem(item.path);
            }}
          >
            <ExternalLink className="size-4" />
            Abrir
          </button>
        )}
        <button
          type="button"
          className={btnGhost}
          onClick={() => onEdit(item)}
        >
          <Pencil className="size-4" />
          Editar
        </button>
        {!item.isGroup && !item.path.startsWith("http") && !item.path.startsWith("deskall://") && (
          <button
            type="button"
            className={btnGhost}
            onClick={() => void revealItem(item.path)}
          >
            <FolderOpen className="size-4" />
            Mostrar en carpeta
          </button>
        )}
        {item.kind === "game" && onFavorite && (
          <button
            type="button"
            className={btnGhost}
            onClick={() => onFavorite(item.id, !item.favorite)}
          >
            <Star
              className={`size-4 ${item.favorite ? "text-yellow-400 fill-yellow-400" : ""}`}
            />
            {item.favorite ? "Quitar favorito" : "Favorito"}
          </button>
        )}
        <button
          type="button"
          className={btnDanger}
          onClick={() => {
            onRemove(item.id);
            onBack();
          }}
        >
          <Trash2 className="size-4" />
          {item.isGroup ? "Eliminar carpeta" : "Quitar de DeskAll"}
        </button>
      </div>

      {/* Stats grid */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          icon={<Clock3 className="size-4" />}
          label="Tiempo de uso"
          value={
            <LiveUsage
              baseMs={item.usageMs ?? 0}
              segmentStart={isActive ? activeSegmentStart : null}
            />
          }
        />
        <StatCard
          icon={<ExternalLink className="size-4" />}
          label="Aperturas"
          value={`${item.launchCount ?? 0}`}
        />
        <StatCard
          icon={<Clock3 className="size-4" />}
          label="Último uso"
          value={item.lastUsedAt ? formatDate(item.lastUsedAt / 1000) : "—"}
        />
        <StatCard
          icon={<FolderOpen className="size-4" />}
          label="Creado"
          value={formatDate(item.createdAt / 1000)}
        />
      </div>

      {/* File info */}
      {!item.isGroup && !item.path.startsWith("http") && details && (
        <div className="rounded-2xl border border-line bg-surface/60 p-4">
          <h2 className="m-0 mb-3 font-display text-base tracking-tight">
            Información del archivo
          </h2>
          <div className="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
            <InfoRow label="Ubicación" value={item.path} mono />
            <InfoRow label="Carpeta" value={details.parentDir} mono />
            <InfoRow label="Tamaño" value={formatSize(details.sizeBytes)} />
            <InfoRow
              label="Modificado"
              value={details.modifiedAt ? formatDate(details.modifiedAt) : "—"}
            />
            <InfoRow
              label="Creado"
              value={details.createdAt ? formatDate(details.createdAt) : "—"}
            />
            <InfoRow label="Tipo" value={details.extension?.toUpperCase() ?? "—"} />
            {details.isSymlink && (
              <InfoRow label="Enlace simbólico" value="Sí" />
            )}
          </div>
        </div>
      )}

      {/* DeskAll folder info */}
      {item.isGroup && (
        <div className="rounded-2xl border border-line bg-surface/60 p-4">
          <h2 className="m-0 mb-3 font-display text-base tracking-tight">
            Carpeta de DeskAll
          </h2>
          <div className="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
            <InfoRow label="Creada" value={formatDate(item.createdAt / 1000)} />
            <InfoRow label="Tab" value={item.groupTab ?? "apps"} />
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface/80 p-3">
      <div className="mb-1 flex items-center gap-1.5 text-xs text-muted">
        {icon}
        {label}
      </div>
      <div className="text-sm font-semibold text-ink">{value}</div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] text-muted">{label}</span>
      <span
        className={`truncate text-sm text-ink ${mono ? "font-mono text-[12px]" : ""}`}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}
