import {
  AppWindow,
  FileText,
  Folder,
  Gamepad2,
  Globe,
} from "./icons";
import type { ItemKind, ShortcutItem } from "../types";
import { KIND_LABELS } from "../types";
import { formatUsage } from "../lib/usage";
import { FitIcon } from "./FitIcon";

interface Props {
  item: ShortcutItem;
  selected: boolean;
  launching?: boolean;
  active?: boolean;
  /** Items inside a category folder */
  childCount?: number;
  onOpen: () => void;
  onSelect: () => void;
  onContext: (e: React.MouseEvent) => void;
  onDragStart: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
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

export function ShortcutTile({
  item,
  selected,
  launching,
  active,
  childCount = 0,
  onOpen,
  onSelect,
  onContext,
  onDragStart,
  onDrop,
}: Props) {
  const usage = item.usageMs ?? 0;
  const isGroup = Boolean(item.isGroup);

  return (
    <button
      type="button"
      className={[
        "group relative flex cursor-pointer flex-col items-center gap-2 rounded-2xl border px-2 pt-3 pb-2.5 text-inherit transition duration-200",
        "hover:-translate-y-0.5 hover:bg-surface/60",
        selected
          ? "tile-selected border-transparent bg-surface/80"
          : "border-transparent",
        launching ? "tile-launching pointer-events-none" : "",
      ].join(" ")}
      draggable={!isGroup}
      onDragStart={onDragStart}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      onClick={onSelect}
      onDoubleClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onOpen();
      }}
      onContextMenu={onContext}
      aria-pressed={selected}
      title={
        isGroup
          ? `${item.name}\nClic: abrir carpeta`
          : `${item.name}\nClic: detalles · Doble clic: abrir`
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
          "relative grid size-16 place-items-center transition duration-200",
          selected ? "scale-105" : "group-hover:scale-[1.03]",
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
      <span className="flex w-full flex-col gap-0.5 text-center">
        <span
          className={[
            "line-clamp-2 text-sm leading-snug font-semibold",
            selected ? "text-ink" : "",
          ].join(" ")}
        >
          {item.name}
        </span>
        <span className="text-xs text-muted">
          {isGroup
            ? `Carpeta · ${childCount}`
            : `${KIND_LABELS[item.kind]}${usage > 0 ? ` · ${formatUsage(usage)}` : ""}`}
        </span>
      </span>
    </button>
  );
}
