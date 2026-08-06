import { useEffect, useState } from "react";
import {
  Clipboard,
  LayoutGrid,
  MonitorSmartphone,
  Settings,
} from "lucide-react";
import type { ViewMode } from "./types";
import { useShortcuts } from "./hooks/useShortcuts";
import { useClipboardHistory } from "./hooks/useClipboard";
import { useTheme } from "./hooks/useTheme";
import { DesktopView } from "./components/DesktopView";
import { ClipboardView } from "./components/ClipboardView";
import { SettingsView } from "./components/SettingsView";
import { BootLoader } from "./components/BootLoader";

const MIN_BOOT_MS = 700;

function App() {
  const [view, setView] = useState<ViewMode>("desktop");
  const [bootDone, setBootDone] = useState(false);
  const shortcuts = useShortcuts();
  const clipboard = useClipboardHistory();
  const { theme, setTheme, ready: themeReady } = useTheme();

  const dataReady = shortcuts.ready && clipboard.ready && themeReady;

  useEffect(() => {
    if (!dataReady) return;
    const t = window.setTimeout(() => setBootDone(true), MIN_BOOT_MS);
    return () => window.clearTimeout(t);
  }, [dataReady]);

  if (!bootDone) {
    return <BootLoader />;
  }

  return (
    <div className="relative isolate grid h-full animate-rise grid-cols-1 grid-rows-[auto_1fr] md:grid-cols-[240px_1fr] md:grid-rows-none">
      <div
        className="pointer-events-none absolute top-[8%] left-[28%] z-0 size-[280px] animate-drift rounded-full bg-glow-a opacity-45 blur-[40px]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute right-[4%] bottom-[8%] z-0 h-[220px] w-[320px] animate-drift rounded-full bg-glow-b opacity-45 blur-[40px] [animation-delay:-4s]"
        aria-hidden
      />

      <aside className="relative z-1 flex flex-col gap-6 border-b border-line bg-surface/80 px-4 pt-5 pb-3 backdrop-blur-xl md:border-r md:border-b-0 md:pb-4">
        <div className="flex items-center gap-3.5 px-2 py-1.5" data-tauri-drag-region>
          <span
            className="grid size-9 shrink-0 place-items-center rounded-xl bg-linear-to-br from-zinc-500 via-zinc-700 to-zinc-900 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.25)]"
            aria-hidden
          >
            <MonitorSmartphone className="size-5" strokeWidth={1.8} />
          </span>
          <div>
            <p className="font-display text-[1.35rem] leading-tight font-bold tracking-tight">
              DeskAll
            </p>
            <p className="mt-0.5 text-xs text-muted">Launcher + clipboard</p>
          </div>
        </div>

        <nav className="flex flex-row gap-1.5 md:flex-col" aria-label="Vistas">
          <NavButton
            active={view === "desktop"}
            onClick={() => setView("desktop")}
            count={shortcuts.items.length}
            icon={<LayoutGrid className="size-full" strokeWidth={1.8} />}
          >
            Escritorio
          </NavButton>
          <NavButton
            active={view === "clipboard"}
            onClick={() => setView("clipboard")}
            count={clipboard.entries.length}
            icon={<Clipboard className="size-full" strokeWidth={1.8} />}
          >
            Clipboard
          </NavButton>
          <NavButton
            active={view === "settings"}
            onClick={() => setView("settings")}
            icon={<Settings className="size-full" strokeWidth={1.8} />}
          >
            Ajustes
          </NavButton>
        </nav>

        <footer className="mt-auto hidden p-3 text-xs leading-snug text-muted md:block">
          <p className="m-0">
            Arrastra accesos del Escritorio · Historial de texto e imágenes
          </p>
        </footer>
      </aside>

      <main className="relative z-1 min-w-0 overflow-auto p-4 md:p-5">
        {view === "desktop" ? (
          <DesktopView
            items={shortcuts.items}
            onAddPath={shortcuts.addFromPath}
            onAddUrl={shortcuts.addUrl}
            onRename={shortcuts.rename}
            onSetKind={shortcuts.setKind}
            onRemove={shortcuts.remove}
            onReorder={shortcuts.reorder}
          />
        ) : view === "clipboard" ? (
          <ClipboardView
            entries={clipboard.entries}
            watching={clipboard.watching}
            onWatchingChange={clipboard.setWatching}
            onCopy={clipboard.copyEntry}
            onTogglePin={clipboard.togglePin}
            onRemove={clipboard.remove}
            onClear={clipboard.clearUnpinned}
          />
        ) : (
          <SettingsView theme={theme} onThemeChange={(m) => void setTheme(m)} />
        )}
      </main>
    </div>
  );
}

function NavButton({
  active,
  onClick,
  count,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count?: number;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-ink-soft transition duration-150 hover:translate-x-0.5 hover:bg-surface",
        active ? "bg-surface text-ink shadow-desk" : "",
      ].join(" ")}
    >
      <span className="grid size-5 place-items-center" aria-hidden>
        {icon}
      </span>
      {children}
      {typeof count === "number" && (
        <span className="ml-auto min-w-6 rounded-full bg-accent-soft px-1.5 py-0.5 text-center text-xs text-accent-deep">
          {count}
        </span>
      )}
    </button>
  );
}

export default App;
