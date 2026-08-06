import { useEffect, useRef, useState } from "react";
import { AppWindow } from "lucide-react";
import { extractFileIcon } from "../lib/tauri";
import { fitIconDataUrl } from "../lib/fitIcon";

const CACHE_VER = "fit-v3";

/** path → fitted data URL (or null) */
const cache = new Map<string, string | null>();

function cacheKey(path: string) {
  return `${CACHE_VER}:${path}`;
}

type Job = {
  path: string;
  resolve: (v: string | null) => void;
};

const queue: Job[] = [];
let active = 0;
const MAX_CONCURRENT = 3;

function enqueueIcon(path: string): Promise<string | null> {
  const key = cacheKey(path);
  if (cache.has(key)) {
    return Promise.resolve(cache.get(key) ?? null);
  }
  return new Promise((resolve) => {
    queue.push({ path, resolve });
    pump();
  });
}

function pump() {
  while (active < MAX_CONCURRENT && queue.length) {
    const job = queue.shift()!;
    const key = cacheKey(job.path);
    if (cache.has(key)) {
      job.resolve(cache.get(key) ?? null);
      continue;
    }
    active += 1;
    void extractFileIcon(job.path)
      .then(async (icon) => {
        if (!icon) {
          cache.set(key, null);
          job.resolve(null);
          return;
        }
        try {
          const fitted = await fitIconDataUrl(icon, 96);
          cache.set(key, fitted);
          job.resolve(fitted);
        } catch {
          cache.set(key, icon);
          job.resolve(icon);
        }
      })
      .catch(() => {
        cache.set(key, null);
        job.resolve(null);
      })
      .finally(() => {
        active -= 1;
        pump();
      });
  }
}

/** Lazy system icon — extracted, cropped and scaled to fill the box. */
export function ProgramIcon({
  path,
  className = "size-9",
  defer = false,
}: {
  path: string;
  className?: string;
  defer?: boolean;
}) {
  const key = cacheKey(path);
  const [src, setSrc] = useState<string | null>(() =>
    cache.has(key) ? (cache.get(key) ?? null) : null,
  );
  const [tried, setTried] = useState(() => cache.has(key));
  const ref = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(!defer);

  useEffect(() => {
    if (!defer) {
      setVisible(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "80px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [defer]);

  useEffect(() => {
    if (!visible) return;
    const k = cacheKey(path);
    if (cache.has(k)) {
      setSrc(cache.get(k) ?? null);
      setTried(true);
      return;
    }
    let cancelled = false;
    void enqueueIcon(path).then((icon) => {
      if (!cancelled) {
        setSrc(icon);
        setTried(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [path, visible]);

  if (src) {
    return (
      <img
        src={src}
        alt=""
        className={`${className} shrink-0 object-contain`}
        draggable={false}
      />
    );
  }

  return (
    <span
      ref={ref}
      className={`grid shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-deep ${className}`}
      aria-hidden
    >
      <AppWindow
        className={
          tried
            ? "size-[55%] opacity-70"
            : "size-[55%] animate-pulse opacity-40"
        }
        strokeWidth={1.8}
      />
    </span>
  );
}
