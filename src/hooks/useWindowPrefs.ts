import { useCallback, useEffect, useRef, useState } from "react";
import { LazyStore } from "@tauri-apps/plugin-store";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isLaunchAtStartup, setLaunchAtStartup } from "../lib/tauri";

const store = new LazyStore("deskall.json");

export interface WindowPrefs {
  /** Register DeskAll in Windows startup */
  launchAtStartup: boolean;
  /** When launching at startup, start minimized to the taskbar */
  startMinimized: boolean;
  /** Close (X) minimizes to the taskbar instead of quitting */
  closeToMinimize: boolean;
}

const DEFAULTS: WindowPrefs = {
  launchAtStartup: false,
  startMinimized: true,
  closeToMinimize: true,
};

export function useWindowPrefs() {
  const [prefs, setPrefs] = useState<WindowPrefs>(DEFAULTS);
  const [ready, setReady] = useState(false);
  const allowQuitRef = useRef(false);
  const closeToMinimizeRef = useRef(DEFAULTS.closeToMinimize);

  useEffect(() => {
    closeToMinimizeRef.current = prefs.closeToMinimize;
  }, [prefs.closeToMinimize]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const launchAtStartup =
        (await store.get<boolean>("launchAtStartup")) ?? DEFAULTS.launchAtStartup;
      const startMinimized =
        (await store.get<boolean>("startMinimized")) ?? DEFAULTS.startMinimized;
      const closeToMinimize =
        (await store.get<boolean>("closeToMinimize")) ?? DEFAULTS.closeToMinimize;

      try {
        const osEnabled = await isLaunchAtStartup();
        if (launchAtStartup) {
          await setLaunchAtStartup(true, startMinimized);
        } else if (osEnabled) {
          await setLaunchAtStartup(false, false);
        }
      } catch {
        /* ignore */
      }

      if (!cancelled) {
        setPrefs({ launchAtStartup, startMinimized, closeToMinimize });
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    let unlisten: (() => void) | undefined;
    void (async () => {
      unlisten = await getCurrentWindow().onCloseRequested(async (event) => {
        if (!closeToMinimizeRef.current || allowQuitRef.current) {
          allowQuitRef.current = false;
          return;
        }
        event.preventDefault();
        await getCurrentWindow().minimize();
      });
    })();
    return () => {
      unlisten?.();
    };
  }, [ready]);

  const update = useCallback(async (partial: Partial<WindowPrefs>) => {
    const next = await new Promise<WindowPrefs>((resolve) => {
      setPrefs((prev) => {
        const merged = { ...prev, ...partial };
        resolve(merged);
        return merged;
      });
    });
    await store.set("launchAtStartup", next.launchAtStartup);
    await store.set("startMinimized", next.startMinimized);
    await store.set("closeToMinimize", next.closeToMinimize);
    await store.save();

    if ("launchAtStartup" in partial || "startMinimized" in partial) {
      await setLaunchAtStartup(next.launchAtStartup, next.startMinimized);
    }
  }, []);

  const quit = useCallback(async () => {
    allowQuitRef.current = true;
    await getCurrentWindow().close();
  }, []);

  return { prefs, ready, update, quit };
}
