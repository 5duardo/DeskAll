import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import {
  AppWindow,
  Clock3,
  ExternalLink,
  FolderOpen,
  Pencil,
  X,
} from "./icons";
import type { ShortcutItem } from "../types";
import { KIND_LABELS } from "../types";
import { formatUsage, liveUsageMs } from "../lib/usage";
import { btnGhost, btnPrimary } from "../lib/ui";
import { FitIcon } from "./FitIcon";

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

interface Props {
  selected: ShortcutItem;
  running: boolean;
  childCount: number;
  activeUsageId: string | null;
  activeSegmentStart: number | null;
  onClose: () => void;
  onOpen: () => void;
  onEdit: () => void;
  onReveal: () => void;
  onRemove: () => void;
}

export function PreviewModal({
  selected,
  running,
  childCount,
  activeUsageId,
  activeSegmentStart,
  onClose,
  onOpen,
  onEdit,
  onReveal,
  onRemove,
}: Props) {
  return createPortal(
    <div className="fixed inset-0 z-[100] grid place-items-center p-4">
      <button
        type="button"
        className="absolute inset-0 border-0 bg-ink/30 backdrop-blur-[3px]"
        aria-label="Cerrar"
        onClick={onClose}
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
          onClick={onClose}
          aria-label="Cerrar"
        >
          <X className="size-4" strokeWidth={1.8} />
        </button>

        <div className="flex flex-col items-center gap-3 text-center">
          <div className="relative">
            {selected.iconDataUrl ? (
              <FitIcon src={selected.iconDataUrl} className="size-20" size={160} />
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
            {running && (
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
                ? `Carpeta · ${childCount} ítems`
                : KIND_LABELS[selected.kind]}
              {!selected.isGroup && running ? " · En uso" : ""}
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
                      activeUsageId === selected.id ? activeSegmentStart : null
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
          <button type="button" className={btnPrimary} onClick={onOpen}>
            {selected.isGroup ? (
              <FolderOpen className="size-4" strokeWidth={1.8} />
            ) : (
              <ExternalLink className="size-4" strokeWidth={1.8} />
            )}
            {selected.isGroup ? "Abrir carpeta" : "Abrir"}
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={btnGhost} onClick={onEdit}>
              <Pencil className="size-4" strokeWidth={1.8} />
              Editar
            </button>
            {!selected.isGroup ? (
              <button type="button" className={btnGhost} onClick={onReveal}>
                Ubicación
              </button>
            ) : (
              <button type="button" className={btnGhost} onClick={onRemove}>
                Eliminar
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
