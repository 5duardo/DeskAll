import { Image } from "@tauri-apps/api/image";
import { writeImage } from "@tauri-apps/plugin-clipboard-manager";

const THUMB_EDGE = 480;

function fingerprintRgba(rgba: Uint8Array, width: number, height: number): string {
  let acc = 0;
  const step = Math.max(1, Math.floor(rgba.length / 64));
  for (let i = 0; i < rgba.length; i += step) acc = (acc * 31 + rgba[i]) >>> 0;
  return `img:${width}x${height}:${rgba.length}:${acc}`;
}

/**
 * Convert clipboard Image (RGBA) to PNG data URLs: full resolution for the
 * saved file and a small thumbnail for the history UI.
 */
export async function clipboardImageToDataUrl(image: Image): Promise<{
  dataUrl: string;
  thumbDataUrl: string;
  width: number;
  height: number;
  fingerprint: string;
}> {
  const rgba = await image.rgba();
  const size = await image.size();
  const width = size.width;
  const height = size.height;
  const fingerprint = fingerprintRgba(rgba, width, height);

  const src = document.createElement("canvas");
  src.width = width;
  src.height = height;
  const sctx = src.getContext("2d");
  if (!sctx) throw new Error("Canvas no disponible");
  const pixels = new Uint8ClampedArray(rgba.buffer.slice(0));
  if (pixels.length < width * height * 4) {
    throw new Error("Datos de imagen incompletos");
  }
  const imageData = new ImageData(pixels.slice(0, width * height * 4), width, height);
  sctx.putImageData(imageData, 0, 0);

  const scale = Math.min(1, THUMB_EDGE / Math.max(width, height));
  const outW = Math.max(1, Math.round(width * scale));
  const outH = Math.max(1, Math.round(height * scale));
  const thumb = document.createElement("canvas");
  thumb.width = outW;
  thumb.height = outH;
  const tctx = thumb.getContext("2d");
  if (!tctx) throw new Error("Canvas no disponible");
  tctx.imageSmoothingEnabled = true;
  tctx.drawImage(src, 0, 0, outW, outH);

  const thumbDataUrl = thumb.toDataURL("image/png");
  let dataUrl = thumbDataUrl;
  try {
    const full = src.toDataURL("image/png");
    if (full.startsWith("data:image/png")) dataUrl = full;
  } catch {
    /* keep the thumbnail if the full-size PNG cannot be encoded */
  }

  return {
    dataUrl,
    thumbDataUrl,
    width,
    height,
    fingerprint,
  };
}

/** Put a PNG data URL back on the system clipboard. */
export async function writeDataUrlToClipboard(dataUrl: string): Promise<void> {
  const img = new window.Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("No se pudo cargar la imagen"));
    img.src = dataUrl;
  });

  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas no disponible");
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const tauriImage = await Image.new(data, canvas.width, canvas.height);
  await writeImage(tauriImage);
}

/** Put the full-resolution image file back on the system clipboard. */
export async function writeImageFileToClipboard(path: string): Promise<void> {
  const image = await Image.fromPath(path);
  await writeImage(image);
}
