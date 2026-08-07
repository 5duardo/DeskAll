import { useEffect, useState } from "react";
import {
  Clipboard,
  Cpu,
  LayoutGrid,
  Settings,
} from "./components/icons";
import type { ViewMode } from "./types";
import { useShortcuts } from "./hooks/useShortcuts";
import { useClipboardHistory } from "./hooks/useClipboard";
import { useTheme } from "./hooks/useTheme";
import { useWindowPrefs } from "./hooks/useWindowPrefs";
import { DesktopView } from "./components/DesktopView";
import { ClipboardView } from "./components/ClipboardView";
import { PcInfoView } from "./components/PcInfoView";
import { SettingsView } from "./components/SettingsView";
import { BootLoader } from "./components/BootLoader";
import { WindowControls } from "./components/WindowControls";
import { CopyLoader } from "./components/CopyLoader";
import { hideScrollbar } from "./lib/ui";

const MIN_BOOT_MS = 700;

function App() {
  const [view, setView] = useState<ViewMode>("desktop");
  const [bootDone, setBootDone] = useState(false);
  const shortcuts = useShortcuts();
  const clipboard = useClipboardHistory();
  const { theme, setTheme, ready: themeReady } = useTheme();
  const windowPrefs = useWindowPrefs();

  const dataReady =
    shortcuts.ready && clipboard.ready && themeReady && windowPrefs.ready;

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

      <header className="relative z-20 col-span-full flex h-9 items-center border-b border-line bg-surface/90 backdrop-blur-xl md:col-span-2">
        <div
          className="flex min-w-0 flex-1 items-center gap-2 px-3"
          data-tauri-drag-region
        >
          <span
            className="truncate text-xs font-medium text-muted"
            data-tauri-drag-region
          >
            DeskAll
          </span>
        </div>
        <WindowControls
          closeToMinimize={windowPrefs.prefs.closeToMinimize}
          onQuit={() => void windowPrefs.quit()}
        />
      </header>

      <aside className="relative z-1 flex flex-col gap-6 border-b border-line bg-surface/80 px-4 pt-4 pb-3 backdrop-blur-xl md:border-r md:border-b-0 md:pb-4">
        <div className="px-2 py-1.5" data-tauri-drag-region>
          <p className="font-display text-[1.35rem] leading-tight font-bold tracking-tight">
            DeskAll
          </p>
          <p className="mt-0.5 text-xs text-muted">Launcher + clipboard</p>
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
            active={view === "pcinfo"}
            onClick={() => setView("pcinfo")}
            icon={<Cpu className="size-full" strokeWidth={1.8} />}
          >
            PC
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

      <main
        className={[
          "relative z-1 min-w-0 overflow-auto p-4 md:p-5",
          view === "desktop" ? hideScrollbar : "",
        ].join(" ")}
      >
        {view === "desktop" ? (
          <DesktopView
            items={shortcuts.items}
            activeUsageId={shortcuts.activeUsageId}
            activeSegmentStart={shortcuts.activeSegmentStart}
            runningIds={shortcuts.runningIds}
            onAddPath={shortcuts.addFromPath}
            onAddUrl={shortcuts.addUrl}
            onAddGroup={shortcuts.addGroup}
            onMoveToFolder={shortcuts.moveToFolder}
            onRename={shortcuts.rename}
            onSetIcon={shortcuts.setIcon}
            onSetKind={shortcuts.setKind}
            onSetFavorite={shortcuts.setFavorite}
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
        ) : view === "pcinfo" ? (
          <PcInfoView />
        ) : (
          <SettingsView
            theme={theme}
            onThemeChange={(m) => void setTheme(m)}
            items={shortcuts.items}
            clipboardEntries={clipboard.entries}
            onRestoreShortcuts={shortcuts.replaceAll}
            onRestoreClipboard={clipboard.replaceAll}
            windowPrefs={windowPrefs.prefs}
            onWindowPrefsChange={(p) => void windowPrefs.update(p)}
            onQuit={() => void windowPrefs.quit()}
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
