import { Image } from "@tauri-apps/api/image";
import { writeImage } from "@tauri-apps/plugin-clipboard-manager";

const MAX_EDGE = 480;

function fingerprintRgba(rgba: Uint8Array, width: number, height: number): string {
  let acc = 0;
  const step = Math.max(1, Math.floor(rgba.length / 64));
  for (let i = 0; i < rgba.length; i += step) acc = (acc * 31 + rgba[i]) >>> 0;
  return `img:${width}x${height}:${rgba.length}:${acc}`;
}

/** Convert clipboard Image (RGBA) to a PNG data URL, downscaling if huge. */
export async function clipboardImageToDataUrl(image: Image): Promise<{
  dataUrl: string;
  width: number;
  height: number;
  fingerprint: string;
}> {
  const rgba = await image.rgba();
  const size = await image.size();
  let width = size.width;
  let height = size.height;
  const fingerprint = fingerprintRgba(rgba, width, height);

  const canvas = document.createElement("canvas");
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  const outW = Math.max(1, Math.round(width * scale));
  const outH = Math.max(1, Math.round(height * scale));

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

  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas no disponible");
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(src, 0, 0, outW, outH);

  return {
    dataUrl: canvas.toDataURL("image/png"),
    width: outW,
    height: outH,
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
