import { useCallback, useEffect, useState } from "react";
import type { ThemeMode } from "../types";
import { store } from "../lib/store";

function resolveTheme(mode: ThemeMode): "light" | "dark" {
  if (mode === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return mode;
}

function applyTheme(mode: ThemeMode) {
  const resolved = resolveTheme(mode);
  document.documentElement.classList.toggle("dark", resolved === "dark");
  document.documentElement.dataset.theme = resolved;
}

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeMode>("system");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = (await store.get<ThemeMode>("theme")) ?? "system";
      if (!cancelled) {
        setThemeState(saved);
        applyTheme(saved);
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready || theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme, ready]);

  const setTheme = useCallback(async (mode: ThemeMode) => {
    setThemeState(mode);
    applyTheme(mode);
    await store.set("theme", mode);
    await store.save();
  }, []);

  return { theme, setTheme, ready, resolved: resolveTheme(theme) };
}
