import { Gamepad2, Star } from "./icons";
import { memo } from "react";
import type { ShortcutItem } from "../types";
import { FitIcon } from "./FitIcon";

interface Props {
  item: ShortcutItem;
  selected: boolean;
  launching?: boolean;
  active?: boolean;
  dropTarget?: boolean;
  dragging?: boolean;
  onOpen: () => void;
  onSelect: () => void;
  onContext: (e: React.MouseEvent) => void;
  onMovePointerDown?: (e: React.PointerEvent, id: string) => void;
  onToggleFavorite?: () => void;
}

function formatLastPlayed(ts?: number): string {
  if (!ts) return "Nunca ejecutado";
  const diff = Math.max(0, Date.now() - ts);
  const sec = Math.floor(diff / 1000);
  if (sec < 45) return "Hace un momento";
  const min = Math.floor(sec / 60);
  if (min < 60) return `Hace ${min} min`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return hours === 1 ? "Hace 1 hora" : `Hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Ayer";
  if (days < 7) return `Hace ${days} días`;
  return new Date(ts).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

/** Rectangular banner with blurred icon as background. */
function GameBannerView({
  item,
  selected,
  launching,
  active,
  dropTarget = false,
  dragging = false,
  onOpen,
  onSelect,
  onContext,
  onMovePointerDown,
  onToggleFavorite,
}: Props) {
  const hasIcon = Boolean(item.iconDataUrl);

  return (
    <div
      role="button"
      tabIndex={0}
      data-deskall-id={item.id}
      data-deskall-drop="item"
      className={[
        "group relative flex aspect-[16/10] w-full cursor-pointer flex-col overflow-hidden rounded-none border text-inherit transition duration-200 select-none",
        selected
          ? "border-accent/50 shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-accent)_40%,transparent),0_12px_32px_rgb(0_0_0_/0.4)]"
          : "border-line/50 hover:border-ink/20 hover:-translate-y-0.5 hover:shadow-desk",
        dropTarget ? "border-accent ring-2 ring-accent/40" : "",
        dragging ? "pointer-events-none opacity-35" : "",
        launching ? "tile-launching pointer-events-none" : "",
      ].join(" ")}
      style={
        !hasIcon
          ? {
              background: `linear-gradient(160deg, color-mix(in oklab, ${item.color} 28%, #27272a), #09090b)`,
            }
          : undefined
      }
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        onMovePointerDown?.(e, item.id);
      }}
      onClick={onSelect}
      onDoubleClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onOpen();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      onContextMenu={onContext}
      aria-pressed={selected}
      title={`${item.name}\nClic: detalles · Arrastra · Estrella: favorito`}
    >
      {onToggleFavorite && (
        <button
          type="button"
          className={[
            "absolute top-2.5 right-2.5 z-20 grid size-8 cursor-pointer place-items-center rounded-full border-0 transition",
            item.favorite
              ? "bg-black/45 text-amber-300"
              : "bg-black/35 text-white/55 opacity-0 group-hover:opacity-100",
          ].join(" ")}
          title={item.favorite ? "Quitar de favoritos" : "Marcar favorito"}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleFavorite();
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <Star className="size-3.5" strokeWidth={1.8} />
        </button>
      )}

      {hasIcon && (
        <>
          <img
            src={item.iconDataUrl!}
            alt=""
            aria-hidden
            className="pointer-events-none absolute inset-[-20%] size-[140%] max-w-none scale-105 object-cover opacity-65 blur-[18px] saturate-[1.1] brightness-[0.72] transition duration-300 group-hover:opacity-75 group-hover:brightness-[0.8]"
            draggable={false}
          />
          <span
            className="pointer-events-none absolute inset-0 bg-linear-to-b from-black/15 via-black/35 to-black/75"
            aria-hidden
          />
        </>
      )}

      {!hasIcon && (
        <span
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_25%,rgb(0_0_0_/0.5)_100%)]"
          aria-hidden
        />
      )}

      {active && (
        <span
          className="absolute top-3 left-3 z-10 size-2.5 rounded-full border border-paper bg-[#22c55e] shadow-[0_0_0_2px_rgba(34,197,94,0.25)]"
          title="En uso"
          aria-label="En uso"
        />
      )}

      <span className="pointer-events-none relative z-[1] flex min-h-0 flex-1 items-center justify-center px-4 pt-4 pb-1">
        {hasIcon ? (
          item.iconCustom ? (
            <img
              src={item.iconDataUrl!}
              alt=""
              className="size-[4.25rem] object-contain drop-shadow-[0_10px_24px_rgb(0_0_0_/0.55)] transition duration-200 group-hover:scale-105 sm:size-[4.75rem]"
              draggable={false}
            />
          ) : (
            <FitIcon
              src={item.iconDataUrl!}
              className="size-[4.25rem] drop-shadow-[0_10px_24px_rgb(0_0_0_/0.55)] transition duration-200 group-hover:scale-105 sm:size-[4.75rem]"
              size={160}
            />
          )
        ) : (
          <span
            className="grid size-16 place-items-center rounded-2xl text-white shadow-desk sm:size-[4.5rem]"
            style={{ background: item.color }}
          >
            <Gamepad2 className="size-8 sm:size-9" strokeWidth={1.6} />
          </span>
        )}
      </span>

      <span className="pointer-events-none relative z-[1] flex w-full shrink-0 flex-col items-start gap-0.5 px-3.5 pt-1 pb-3.5 text-left">
        <span className="w-full truncate text-sm font-semibold tracking-tight text-white drop-shadow-md">
          {item.name}
        </span>
        <span className="w-full truncate text-xs text-white/60">
          {dropTarget
            ? "Soltar aquí"
            : active
              ? "En uso ahora"
              : formatLastPlayed(item.lastUsedAt)}
        </span>
      </span>
    </div>
  );
}

export const GameBanner = memo(GameBannerView, (prev, next) =>
  prev.item === next.item &&
  prev.selected === next.selected &&
  prev.launching === next.launching &&
  prev.active === next.active &&
  prev.dropTarget === next.dropTarget &&
  prev.dragging === next.dragging,
);
