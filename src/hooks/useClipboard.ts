import { useCallback, useEffect, useRef, useState } from "react";
import {
  readImage,
  readText,
  writeText,
} from "@tauri-apps/plugin-clipboard-manager";
import type { ClipboardEntry } from "../types";
import {
  createId,
  deleteClipboardFile,
  saveClipboardImage,
  saveClipboardText,
} from "../lib/tauri";
import {
  clipboardImageToDataUrl,
  writeDataUrlToClipboard,
} from "../lib/clipboardImage";
import { store } from "../lib/store";

const MAX_HISTORY = 80;
const MAX_IMAGES = 24;

function mergeHistory(next: ClipboardEntry[]): ClipboardEntry[] {
  const pinned = next.filter((e) => e.pinned);
  const unpinned = next.filter((e) => !e.pinned);
  const images = unpinned.filter((e) => e.kind === "image").slice(0, MAX_IMAGES);
  const texts = unpinned.filter((e) => e.kind === "text");
  const rest = [...images, ...texts]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_HISTORY);
  return [...pinned, ...rest.filter((e) => !pinned.some((p) => p.id === e.id))];
}

function bumpOrInsert(
  prev: ClipboardEntry[],
  entry: Omit<ClipboardEntry, "id" | "createdAt" | "pinned"> & {
    id?: string;
  },
): { next: ClipboardEntry[]; dropped: ClipboardEntry[] } {
  const existing = prev.find((e) => e.fingerprint === entry.fingerprint);
  if (existing) {
    const next = mergeHistory([
      { ...existing, createdAt: Date.now() },
      ...prev.filter((e) => e.id !== existing.id),
    ]);
    return { next, dropped: [] };
  }

  const fresh: ClipboardEntry = {
    id: entry.id ?? createId(),
    createdAt: Date.now(),
    pinned: false,
    kind: entry.kind,
    text: entry.text,
    imageDataUrl: entry.imageDataUrl,
    width: entry.width,
    height: entry.height,
    filePath: entry.filePath,
    fingerprint: entry.fingerprint,
  };
  const next = mergeHistory([fresh, ...prev]);
  const kept = new Set(next.map((e) => e.id));
  const dropped = prev.filter((e) => !kept.has(e.id));
  return { next, dropped };
}

async function purgeFiles(entries: ClipboardEntry[]) {
  await Promise.all(
    entries.map(async (e) => {
      if (e.filePath) {
        try {
          await deleteClipboardFile(e.filePath);
        } catch {
          /* ignore */
        }
      }
    }),
  );
}

export function useClipboardHistory() {
  const [entries, setEntries] = useState<ClipboardEntry[]>([]);
  const [ready, setReady] = useState(false);
  const [watching, setWatching] = useState(true);
  const lastTextFp = useRef<string>("");
  const lastImageFp = useRef<string>("");
  const imageBusy = useRef(false);
  const entriesRef = useRef<ClipboardEntry[]>([]);

  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = (await store.get<ClipboardEntry[]>("clipboard")) ?? [];
      const normalized = saved.map((e) => {
        if (e.kind) return e;
        const legacy = e as ClipboardEntry & { text?: string };
        return {
          ...legacy,
          kind: "text" as const,
          fingerprint: legacy.fingerprint || `text:${legacy.text ?? ""}`,
        };
      });
      if (!cancelled) {
        setEntries(normalized);
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback(async (next: ClipboardEntry[]) => {
    setEntries(next);
    await store.set("clipboard", next);
    await store.save();
  }, []);

  const pushEntry = useCallback(
    (
      builder: (
        prev: ClipboardEntry[],
      ) => { next: ClipboardEntry[]; dropped: ClipboardEntry[] },
    ) => {
      setEntries((prev) => {
        const { next, dropped } = builder(prev);
        if (dropped.length) void purgeFiles(dropped);
        void store.set("clipboard", next).then(() => store.save());
        return next;
      });
    },
    [],
  );

  // Fast text polling — never blocked by image conversion
  useEffect(() => {
    if (!watching || !ready) return;
    let alive = true;

    const tickText = async () => {
      if (!alive) return;
      try {
        const text = await readText();
        if (!alive || text == null) return;
        const trimmed = text.trimEnd();
        if (!trimmed) return;
        const fingerprint = `text:${trimmed}`;
        if (fingerprint === lastTextFp.current) return;
        lastTextFp.current = fingerprint;

        const existing = entriesRef.current.find(
          (e) => e.fingerprint === fingerprint,
        );
        if (existing) {
          pushEntry((prev) =>
            bumpOrInsert(prev, {
              kind: "text",
              text: trimmed,
              fingerprint,
            }),
          );
          return;
        }

        const id = createId();
        let filePath: string | undefined;
        try {
          filePath = await saveClipboardText(id, trimmed);
        } catch {
          /* still keep in history */
        }
        if (!alive) return;
        pushEntry((prev) =>
          bumpOrInsert(prev, {
            id,
            kind: "text",
            text: trimmed,
            fingerprint,
            filePath,
          }),
        );
      } catch {
        // empty / denied
      }
    };

    void tickText();
    const id = window.setInterval(tickText, 450);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [watching, ready, pushEntry]);

  // Slower image polling — independent of text
  useEffect(() => {
    if (!watching || !ready) return;
    let alive = true;

    const tickImage = async () => {
      if (!alive || imageBusy.current) return;
      imageBusy.current = true;
      try {
        const image = await readImage();
        if (!alive) return;
        const converted = await clipboardImageToDataUrl(image);
        if (converted.fingerprint === lastImageFp.current) return;
        lastImageFp.current = converted.fingerprint;

        const existing = entriesRef.current.find(
          (e) => e.fingerprint === converted.fingerprint,
        );
        if (existing) {
          pushEntry((prev) =>
            bumpOrInsert(prev, {
              kind: "image",
              imageDataUrl: converted.dataUrl,
              width: converted.width,
              height: converted.height,
              fingerprint: converted.fingerprint,
            }),
          );
          return;
        }

        const id = createId();
        let filePath: string | undefined;
        try {
          filePath = await saveClipboardImage(id, converted.dataUrl);
        } catch {
          /* still keep in history */
        }
        if (!alive) return;
        pushEntry((prev) =>
          bumpOrInsert(prev, {
            id,
            kind: "image",
            imageDataUrl: converted.dataUrl,
            width: converted.width,
            height: converted.height,
            fingerprint: converted.fingerprint,
            filePath,
          }),
        );
      } catch {
        // no image on clipboard
      } finally {
        imageBusy.current = false;
      }
    };

    void tickImage();
    const id = window.setInterval(tickImage, 1400);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [watching, ready, pushEntry]);

  const copyEntry = useCallback(async (entry: ClipboardEntry) => {
    if (entry.kind === "image" && entry.imageDataUrl) {
      lastImageFp.current = entry.fingerprint;
      await writeDataUrlToClipboard(entry.imageDataUrl);
      return;
    }
    const text = entry.text ?? "";
    if (!text) throw new Error("Entrada sin texto");
    lastTextFp.current = entry.fingerprint || `text:${text}`;
    await writeText(text);
  }, []);

  const togglePin = useCallback(
    async (id: string) => {
      const next = entries.map((e) =>
        e.id === id ? { ...e, pinned: !e.pinned } : e,
      );
      next.sort(
        (a, b) =>
          Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt,
      );
      await persist(next);
    },
    [entries, persist],
  );

  const remove = useCallback(
    async (id: string) => {
      const target = entries.find((e) => e.id === id);
      const next = entries.filter((e) => e.id !== id);
      await persist(next);
      if (target) await purgeFiles([target]);
    },
    [entries, persist],
  );

  const clearUnpinned = useCallback(async () => {
    const dropped = entries.filter((e) => !e.pinned);
    await persist(entries.filter((e) => e.pinned));
    await purgeFiles(dropped);
  }, [entries, persist]);

  const replaceAll = useCallback(
    async (next: ClipboardEntry[]) => {
      await persist(next);
    },
    [persist],
  );

  return {
    entries,
    ready,
    watching,
    setWatching,
    copyEntry,
    togglePin,
    remove,
    clearUnpinned,
    replaceAll,
  };
}
