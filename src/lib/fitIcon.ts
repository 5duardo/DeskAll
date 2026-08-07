/** Cache trimmed data-URLs (versioned to bust bad entries). */
const CACHE_VER = "v5";
const trimmedCache = new Map<string, string>();
const pendingFits = new Map<string, Promise<string>>();
const MAX_CACHE_ENTRIES = 160;

function cacheIcon(key: string, value: string): void {
  trimmedCache.delete(key);
  trimmedCache.set(key, value);
  while (trimmedCache.size > MAX_CACHE_ENTRIES) {
    const oldest = trimmedCache.keys().next().value;
    if (!oldest) break;
    trimmedCache.delete(oldest);
  }
}

function cacheKey(src: string, outSize: number): string {
  // Many PNGs share the same data-URL prefix; sample head/mid/tail.
  const midStart = Math.max(0, Math.floor(src.length / 2) - 24);
  const head = src.slice(0, 48);
  const mid = src.slice(midStart, midStart + 48);
  const tail = src.slice(-48);
  return `${CACHE_VER}:${outSize}:${src.length}:${head}:${mid}:${tail}`;
}

type Rgba = { r: number; g: number; b: number; a: number };

function px(data: Uint8ClampedArray, i: number): Rgba {
  const o = i * 4;
  return { r: data[o], g: data[o + 1], b: data[o + 2], a: data[o + 3] };
}

function dist2(a: Rgba, b: Rgba): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return dr * dr + dg * dg + db * db;
}

/** Average color of corners — Windows often paints opaque dark padding here. */
function sampleBackground(
  data: Uint8ClampedArray,
  w: number,
  h: number,
): Rgba {
  const pts = [
    [0, 0],
    [w - 1, 0],
    [0, h - 1],
    [w - 1, h - 1],
    [Math.min(2, w - 1), Math.min(2, h - 1)],
    [Math.max(0, w - 3), Math.min(2, h - 1)],
    [Math.min(2, w - 1), Math.max(0, h - 3)],
    [Math.max(0, w - 3), Math.max(0, h - 3)],
  ];
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;
  for (const [x, y] of pts) {
    const p = px(data, y * w + x);
    r += p.r;
    g += p.g;
    b += p.b;
    a += p.a;
  }
  const n = pts.length;
  return {
    r: Math.round(r / n),
    g: Math.round(g / n),
    b: Math.round(b / n),
    a: Math.round(a / n),
  };
}

function isPadding(p: Rgba, bg: Rgba): boolean {
  // True transparency
  if (p.a < 24) return true;
  // Semi-transparent near-bg
  if (p.a < 90 && dist2(p, bg) < 35 * 35) return true;
  // Opaque (or near) matching corner background — common Shell artifact
  if (bg.a >= 200 && dist2(p, bg) < 42 * 42) return true;
  // Near-black regardless of corner (GDI clear)
  if (p.r < 22 && p.g < 22 && p.b < 22 && p.a > 200) return true;
  return false;
}

/**
 * Crop padding from an icon and redraw filling a square canvas.
 * Fixes Shell icons that embed a tiny glyph in a large dark/transparent square.
 */
async function fitIconDataUrlImpl(
  src: string,
  outSize = 128,
): Promise<string> {
  const key = cacheKey(src, outSize);
  const cached = trimmedCache.get(key);
  if (cached) return cached;

  const img = await loadImage(src);
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) {
    cacheIcon(key, src);
    return src;
  }

  const probe = document.createElement("canvas");
  probe.width = w;
  probe.height = h;
  const pctx = probe.getContext("2d", { willReadFrequently: true });
  if (!pctx) {
    cacheIcon(key, src);
    return src;
  }
  pctx.clearRect(0, 0, w, h);
  pctx.drawImage(img, 0, 0);

  const { data } = pctx.getImageData(0, 0, w, h);
  const len = w * h;
  const bg = sampleBackground(data, w, h);
  const pad = new Uint8Array(len);

  for (let i = 0; i < len; i++) {
    pad[i] = isPadding(px(data, i), bg) ? 1 : 0;
  }

  // Flood-fill padding from borders only (preserve dark art inside the glyph)
  const edgePad = new Uint8Array(len);
  const stack: number[] = [];
  const tryPush = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = y * w + x;
    if (!pad[i] || edgePad[i]) return;
    edgePad[i] = 1;
    stack.push(i);
  };

  for (let x = 0; x < w; x++) {
    tryPush(x, 0);
    tryPush(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    tryPush(0, y);
    tryPush(w - 1, y);
  }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w;
    const y = (i / w) | 0;
    tryPush(x - 1, y);
    tryPush(x + 1, y);
    tryPush(x, y - 1);
    tryPush(x, y + 1);
  }

  let minX = w;
  let minY = h;
  let maxX = 0;
  let maxY = 0;
  let found = false;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (edgePad[i]) continue;
      const p = px(data, i);
      // Must be visibly opaque enough to count as glyph
      if (p.a < 40) continue;
      found = true;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  // Fallback: bbox of any non-transparent pixel
  if (!found) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = px(data, y * w + x);
        if (p.a < 30) continue;
        found = true;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (!found) {
    cacheIcon(key, src);
    return src;
  }

  const margin = Math.max(1, Math.round(Math.min(w, h) * 0.02));
  minX = Math.max(0, minX - margin);
  minY = Math.max(0, minY - margin);
  maxX = Math.min(w - 1, maxX + margin);
  maxY = Math.min(h - 1, maxY + margin);

  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;

  const out = document.createElement("canvas");
  out.width = outSize;
  out.height = outSize;
  const octx = out.getContext("2d");
  if (!octx) {
    cacheIcon(key, src);
    return src;
  }
  octx.clearRect(0, 0, outSize, outSize);
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = "high";

  // Always crop to content and fill ~94% of the output square
  const target = outSize * 0.94;
  const scale = Math.min(target / cw, target / ch);
  const dw = Math.max(1, cw * scale);
  const dh = Math.max(1, ch * scale);
  octx.drawImage(
    img,
    minX,
    minY,
    cw,
    ch,
    (outSize - dw) / 2,
    (outSize - dh) / 2,
    dw,
    dh,
  );

  const result = out.toDataURL("image/png");
  cacheIcon(key, result);
  return result;
}

/** Fits an icon once even when several tiles request it simultaneously. */
export function fitIconDataUrl(src: string, outSize = 128): Promise<string> {
  const key = cacheKey(src, outSize);
  const cached = trimmedCache.get(key);
  if (cached) return Promise.resolve(cached);

  const pending = pendingFits.get(key);
  if (pending) return pending;

  const work = fitIconDataUrlImpl(src, outSize).finally(() => {
    pendingFits.delete(key);
  });
  pendingFits.set(key, work);
  return work;
}

/** Square-crop user image for a custom tile avatar (no shell padding trim). */
export async function prepareCustomAvatar(
  src: string,
  outSize = 192,
): Promise<string> {
  const img = await loadImage(src);
  const canvas = document.createElement("canvas");
  canvas.width = outSize;
  canvas.height = outSize;
  const ctx = canvas.getContext("2d");
  if (!ctx) return src;
  const scale = Math.max(outSize / img.width, outSize / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, (outSize - dw) / 2, (outSize - dh) / 2, dw, dh);
  return canvas.toDataURL("image/png");
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("icon load failed"));
    img.src = src;
  });
}
