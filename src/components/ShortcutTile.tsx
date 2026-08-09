import {
  AppWindow,
  FileText,
  Folder,
  Gamepad2,
  Globe,
} from "./icons";
import type { ItemKind, ShortcutItem } from "../types";
import { FitIcon } from "./FitIcon";
import { memo } from "react";

interface Props {
  item: ShortcutItem;
  selected: boolean;
  launching?: boolean;
  active?: boolean;
  childCount?: number;
  dropTarget?: boolean;
  dragging?: boolean;
  onOpen: () => void;
  onSelect: () => void;
  onContext: (e: React.MouseEvent) => void;
  /** Start pointer-drag for moving into folders */
  onMovePointerDown?: (e: React.PointerEvent, id: string) => void;
}

function KindGlyph({ kind }: { kind: ItemKind }) {
  const cls = "size-[1.55rem]";
  switch (kind) {
    case "app":
      return <AppWindow className={cls} strokeWidth={1.8} />;
    case "game":
      return <Gamepad2 className={cls} strokeWidth={1.8} />;
    case "folder":
      return <Folder className={cls} strokeWidth={1.8} />;
    case "url":
      return <Globe className={cls} strokeWidth={1.8} />;
    default:
      return <FileText className={cls} strokeWidth={1.8} />;
  }
}

function ShortcutTileView({
  item,
  selected,
  launching,
  active,
  childCount = 0,
  dropTarget = false,
  dragging = false,
  onOpen,
  onSelect,
  onContext,
  onMovePointerDown,
}: Props) {
  const isGroup = Boolean(item.isGroup);
  const isMissing =
    !isGroup && item.missing && (item.kind === "app" || item.kind === "game");

  return (
    <div
      role="button"
      tabIndex={0}
      data-deskall-id={item.id}
      data-deskall-drop={isGroup ? "folder" : "item"}
      className={[
        "group relative flex cursor-pointer flex-col items-center gap-1 rounded-2xl border px-2 pt-2.5 pb-2 text-inherit transition duration-200 select-none",
        "hover:-translate-y-0.5 hover:bg-surface/60",
        selected
          ? "tile-selected border-transparent bg-surface/80"
          : "border-transparent",
        dropTarget
          ? "border-accent/50 bg-accent-soft ring-2 ring-accent/35 -translate-y-0.5 scale-[1.02]"
          : "",
        dragging ? "pointer-events-none opacity-35" : "",
        launching ? "tile-launching pointer-events-none" : "",
        isMissing ? "grayscale opacity-60" : "",
      ].join(" ")}
      onPointerDown={(e) => {
        if (e.button !== 0 || isGroup) return;
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
      title={
        isGroup
          ? `${item.name}\nClic: abrir carpeta · Suelta apps aquí`
          : `${item.name}\n${
              isMissing ? "No instalado · " : ""
            }Clic: detalles · Arrastra a una carpeta`
      }
    >
      {selected && (
        <span
          className="absolute top-2 right-2 size-2 rounded-full bg-ink dark:bg-paper"
          aria-hidden
        />
      )}
      {active && (
        <span
          className="absolute top-1.5 left-1.5 size-2.5 rounded-full border border-paper bg-[#22c55e] shadow-[0_0_0_2px_rgba(34,197,94,0.25)]"
          title="En uso"
          aria-label="En uso"
        />
      )}
      <span
        className={[
          "pointer-events-none relative grid size-16 place-items-center transition duration-200",
          selected || dropTarget ? "scale-105" : "group-hover:scale-[1.03]",
        ].join(" ")}
      >
        {item.iconDataUrl ? (
          item.iconCustom ? (
            <img
              src={item.iconDataUrl}
              alt=""
              className="size-16 object-contain drop-shadow-md"
              draggable={false}
            />
          ) : (
            <FitIcon src={item.iconDataUrl} className="size-16" size={192} />
          )
        ) : (
          <span
            className="grid size-14 place-items-center rounded-2xl text-white"
            style={{ background: item.color }}
          >
            <KindGlyph kind={item.kind} />
          </span>
        )}
      </span>
      <span className="pointer-events-none flex w-full flex-col gap-0.5 text-center">
        <span
          className={[
            "line-clamp-2 text-sm leading-snug font-semibold",
            selected ? "text-ink" : "",
          ].join(" ")}
        >
          {item.name}
        </span>
        {isGroup && (
          <span className="text-xs text-muted">
            {dropTarget ? "Soltar aquí" : `Carpeta · ${childCount}`}
          </span>
        )}
      </span>
    </div>
  );
}

export const ShortcutTile = memo(ShortcutTileView, (prev, next) =>
  prev.item === next.item &&
  prev.selected === next.selected &&
  prev.launching === next.launching &&
  prev.active === next.active &&
  prev.childCount === next.childCount &&
  prev.dropTarget === next.dropTarget &&
  prev.dragging === next.dragging,
);
