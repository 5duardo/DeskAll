import { createPortal } from "react-dom";
import type { DeskTabId, ShortcutItem } from "../types";

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

interface Props {
  selected: ShortcutItem;
  deskTab: DeskTabId;
  menuPos: { x: number; y: number };
  menuRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onOpen: () => void;
  onEdit: () => void;
  onMoveToFolder: () => void;
  onToggleFavorite: () => void;
  onSetKind: (kind: "app" | "game") => void;
  onReveal: () => void;
  onRemove: () => void;
}

export function ContextMenu({
  selected,
  deskTab,
  menuPos,
  menuRef,
  onClose,
  onOpen,
  onEdit,
  onMoveToFolder,
  onToggleFavorite,
  onSetKind,
  onReveal,
  onRemove,
}: Props) {
  return createPortal(
    <>
      <button
        type="button"
        className="fixed inset-0 z-[80] border-0 bg-ink/28 backdrop-blur-[2px]"
        aria-label="Cerrar menú"
        onClick={onClose}
      />
      <div
        ref={menuRef}
        className="fixed z-[90] flex max-h-[min(420px,calc(100vh-24px))] min-w-[220px] flex-col overflow-y-auto rounded-[14px] border border-line bg-paper p-1.5 shadow-desk [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ left: menuPos.x, top: menuPos.y }}
        role="menu"
      >
        <CtxBtn onClick={onOpen}>
          {selected.isGroup ? "Abrir carpeta" : "Abrir"}
        </CtxBtn>
        <CtxBtn onClick={onEdit}>Editar</CtxBtn>
        {!selected.isGroup && selected.kind !== "game" && deskTab !== "games" && (
          <CtxBtn onClick={onMoveToFolder}>Mover a carpeta…</CtxBtn>
        )}
        {!selected.isGroup && selected.kind === "game" && (
          <CtxBtn onClick={onToggleFavorite}>
            {selected.favorite ? "Quitar de favoritos" : "Marcar como favorito"}
          </CtxBtn>
        )}
        {!selected.isGroup && selected.kind !== "app" && (
          <CtxBtn onClick={() => onSetKind("app")}>Mover a Apps</CtxBtn>
        )}
        {!selected.isGroup && selected.kind !== "game" && (
          <CtxBtn onClick={() => onSetKind("game")}>Mover a Juegos</CtxBtn>
        )}
        {!selected.isGroup && <CtxBtn onClick={onReveal}>Mostrar en librería</CtxBtn>}
        <CtxBtn danger onClick={onRemove}>
          {selected.isGroup ? "Eliminar carpeta" : "Quitar de DeskAll"}
        </CtxBtn>
      </div>
    </>,
    document.body,
  );
}
