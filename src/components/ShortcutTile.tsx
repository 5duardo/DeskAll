import {
  AppWindow,
  FileText,
  Folder,
  Gamepad2,
  Globe,
} from "lucide-react";
import type { ItemKind, ShortcutItem } from "../types";
import { KIND_LABELS } from "../types";

interface Props {
  item: ShortcutItem;
  selected: boolean;
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
  onOpen,
  onSelect,
  onContext,
  onDragStart,
  onDrop,
}: Props) {
  return (
    <button
      type="button"
      className={[
        "flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-transparent px-2 pt-3 pb-2.5 text-inherit transition duration-150 hover:-translate-y-0.5 hover:bg-surface/60",
        selected ? "border-accent/25 bg-surface/70 shadow-desk" : "",
      ].join(" ")}
      draggable
      onDragStart={onDragStart}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      onClick={onSelect}
      onDoubleClick={onOpen}
      onContextMenu={onContext}
      title={`${item.name}\n${item.path}`}
    >
      <span className="relative grid size-16 place-items-center">
        {item.iconDataUrl ? (
          <img
            src={item.iconDataUrl}
            alt=""
            className="size-16 object-contain drop-shadow-md [image-rendering:auto]"
            draggable={false}
          />
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
        <span className="line-clamp-2 text-sm leading-snug font-semibold">
          {item.name}
        </span>
        <span className="text-xs text-muted">{KIND_LABELS[item.kind]}</span>
      </span>
    </button>
  );
}
