import { AppLogo } from "./AppLogo";

interface Props {
  status?: string;
  detail?: string;
}

/** Full-screen boot splash while stores hydrate and updates are checked. */
export function BootLoader({ status = "Cargando", detail }: Props) {
  return (
    <div className="fixed inset-0 z-[200] grid place-items-center bg-paper">
      <div
        className="absolute inset-x-0 top-0 h-9"
        data-tauri-drag-region
        aria-hidden
      />
      <div className="flex flex-col items-center gap-5 animate-rise">
        <AppLogo size="lg" />
        <div className="flex flex-col items-center gap-3">
          <p className="m-0 font-display text-2xl font-bold tracking-tight text-ink">
            DeskAll
          </p>
          <p className="m-0 text-sm text-muted">{status}</p>
          {detail && (
            <p className="m-0 max-w-xs text-center text-xs text-muted/80">
              {detail}
            </p>
          )}
          <span
            className="boot-bar h-0.5 w-28 overflow-hidden rounded-full bg-line"
            aria-label={status}
            role="status"
          >
            <span className="boot-bar-fill block h-full w-1/2 rounded-full bg-ink/70" />
          </span>
        </div>
      </div>
    </div>
  );
}
