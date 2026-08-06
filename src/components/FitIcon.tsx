import { useEffect, useState } from "react";
import { fitIconDataUrl } from "../lib/fitIcon";

interface Props {
  src: string;
  className?: string;
  alt?: string;
  size?: number;
}

/** Displays an app icon cropped/scaled so small glyphs fill the tile. */
export function FitIcon({
  src,
  className = "size-16",
  alt = "",
  size = 128,
}: Props) {
  const [fitted, setFitted] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setFitted(null);
    void fitIconDataUrl(src, size)
      .then((url) => {
        if (!cancelled) {
          setFitted(url);
          setReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFitted(src);
          setReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [src, size]);

  // Don't flash the uncropped tiny glyph
  if (!ready || !fitted) {
    return (
      <span
        className={`${className} inline-block shrink-0 animate-pulse rounded-lg bg-accent-soft/60`}
        aria-hidden
      />
    );
  }

  return (
    <img
      src={fitted}
      alt={alt}
      className={`${className} object-contain drop-shadow-md`}
      draggable={false}
    />
  );
}
