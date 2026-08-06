import { createPortal } from "react-dom";
import { FolderOpen } from "lucide-react";

interface Props {
  label?: string;
}

/** Minimal overlay while copying files/folders into the library. */
export function CopyLoader({ label = "Copiando a librería…" }: Props) {
  return createPortal(
    <div className="fixed inset-0 z-[180] grid place-items-center bg-paper/70 backdrop-blur-[4px]">
      <div className="flex flex-col items-center gap-4 animate-rise-fast">
        <span className="relative grid size-14 place-items-center rounded-2xl border border-line bg-surface shadow-desk">
          <FolderOpen className="size-6 text-ink" strokeWidth={1.6} />
          <span className="absolute inset-x-3 bottom-2.5 h-0.5 overflow-hidden rounded-full bg-line">
            <span className="boot-bar-fill block h-full w-1/2 rounded-full bg-ink/70" />
          </span>
        </span>
        <p className="m-0 text-sm font-medium text-ink">{label}</p>
      </div>
    </div>,
    document.body,
  );
}
