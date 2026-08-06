import { useEffect, useState } from "react";
import {
  Clipboard,
  LayoutGrid,
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
import { AppLogo } from "./components/AppLogo";
import { WindowControls } from "./components/WindowControls";
import { CopyLoader } from "./components/CopyLoader";

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
    return (
      <>
        <BootLoader />
        {shortcuts.copying && <CopyLoader label={shortcuts.copying} />}
      </>
    );
  }

  return (
    <div className="relative isolate grid h-full animate-rise grid-cols-1 grid-rows-[auto_auto_1fr] md:grid-cols-[240px_1fr] md:grid-rows-[auto_1fr]">
      {shortcuts.copying && <CopyLoader label={shortcuts.copying} />}
      <div
        className="pointer-events-none absolute top-[8%] left-[28%] z-0 size-[280px] animate-drift rounded-full bg-glow-a opacity-45 blur-[40px]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute right-[4%] bottom-[8%] z-0 h-[220px] w-[320px] animate-drift rounded-full bg-glow-b opacity-45 blur-[40px] [animation-delay:-4s]"
        aria-hidden
      />

      {/* Frameless title strip */}
      <header className="relative z-20 col-span-full flex h-9 items-center border-b border-line bg-surface/90 backdrop-blur-xl md:col-span-2">
        <div
          className="flex min-w-0 flex-1 items-center gap-2 px-3"
          data-tauri-drag-region
        >
          <AppLogo size="sm" className="pointer-events-none" />
          <span
            className="truncate text-xs font-medium text-muted"
            data-tauri-drag-region
          >
            DeskAll
          </span>
        </div>
        <WindowControls />
      </header>

      <aside className="relative z-1 flex flex-col gap-6 border-b border-line bg-surface/80 px-4 pt-4 pb-3 backdrop-blur-xl md:border-r md:border-b-0 md:pb-4">
        <div className="flex items-center gap-3.5 px-2 py-1.5" data-tauri-drag-region>
          <AppLogo size="md" />
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
            activeUsageId={shortcuts.activeUsageId}
            activeSegmentStart={shortcuts.activeSegmentStart}
            onAddPath={shortcuts.addFromPath}
            onAddUrl={shortcuts.addUrl}
            onAddGroup={shortcuts.addGroup}
            onMoveToFolder={shortcuts.moveToFolder}
            onRename={shortcuts.rename}
            onSetIcon={shortcuts.setIcon}
            onSetKind={shortcuts.setKind}
            onRemove={shortcuts.remove}
            onReorder={shortcuts.reorder}
            onUsageStart={shortcuts.startUsageSession}
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
          <SettingsView
            theme={theme}
            onThemeChange={(m) => void setTheme(m)}
            items={shortcuts.items}
            onResetUsage={(id) => void shortcuts.resetUsage(id)}
          />
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
      aria-current={active ? "page" : undefined}
      className={[
        "relative flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition duration-200",
        active
          ? "bg-ink text-paper shadow-desk"
          : "text-ink-soft hover:translate-x-0.5 hover:bg-surface",
      ].join(" ")}
    >
      {active && (
        <span
          className="absolute top-1/2 left-0 h-5 w-1 -translate-y-1/2 rounded-full bg-paper/80"
          aria-hidden
        />
      )}
      <span className="grid size-5 place-items-center" aria-hidden>
        {icon}
      </span>
      <span className={active ? "font-semibold" : ""}>{children}</span>
      {typeof count === "number" && (
        <span
          className={[
            "ml-auto min-w-6 rounded-full px-1.5 py-0.5 text-center text-xs",
            active
              ? "bg-paper/20 text-paper"
              : "bg-accent-soft text-accent-deep",
          ].join(" ")}
        >
          {count}
        </span>
      )}
    </button>
  );
}

export default App;
