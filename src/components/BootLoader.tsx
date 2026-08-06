import { MonitorSmartphone } from "lucide-react";

/** Minimal full-screen boot splash while stores hydrate. */
export function BootLoader() {
  return (
    <div className="fixed inset-0 z-[200] grid place-items-center bg-paper">
      <div className="flex flex-col items-center gap-5 animate-rise">
        <span
          className="grid size-14 place-items-center rounded-2xl bg-linear-to-br from-zinc-500 via-zinc-700 to-zinc-900 text-white shadow-desk"
          aria-hidden
        >
          <MonitorSmartphone className="size-7" strokeWidth={1.6} />
        </span>
        <div className="flex flex-col items-center gap-3">
          <p className="m-0 font-display text-2xl font-bold tracking-tight text-ink">
            DeskAll
          </p>
          <span
            className="boot-bar h-0.5 w-28 overflow-hidden rounded-full bg-line"
            aria-label="Cargando"
            role="status"
          >
            <span className="boot-bar-fill block h-full w-1/2 rounded-full bg-ink/70" />
          </span>
        </div>
      </div>
    </div>
  );
}
