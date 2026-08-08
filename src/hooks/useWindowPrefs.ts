import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isLaunchAtStartup, quitApp, setLaunchAtStartup } from "../lib/tauri";
import { store } from "../lib/store";

export interface WindowPrefs {
  /** Register DeskAll in Windows startup */
  launchAtStartup: boolean;
  /** When launching at startup, start minimized */
  startMinimized: boolean;
  /** Close (X) hides to the system tray instead of quitting */
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
        if (allowQuitRef.current) {
          allowQuitRef.current = false;
          return;
        }
        if (!prefs.closeToMinimize) return;
        event.preventDefault();
          await getCurrentWindow().hide();
      });
    })();
    return () => {
      unlisten?.();
    };
  }, [ready, prefs.closeToMinimize]);

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
    await quitApp();
  }, []);

  return { prefs, ready, update, quit };
}
