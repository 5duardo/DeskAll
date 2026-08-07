/**
 * Online icon search for apps & games.
 * Sources (no API key):
 * - Wikipedia via Tauri — cover art (Epic-only games like Rocket League)
 * - Steam Store — games still on Steam
 * - Grida / SVGL — brand logos for apps
 * - Iconify — logos + brand packs
 */

import { fetchRemoteImagePng, searchGameCovers } from "./tauri";

const ICONIFY = "https://api.iconify.design";
const STEAM_SEARCH = "https://store.steampowered.com/api/storesearch/";
const GRIDA_SEARCH = "https://icons.grida.co/api/search";

const ICONIFY_PREFIXES =
  "logos,simple-icons,skill-icons,arcticons,cib,fa6-brands,devicon,vscode-icons,game-icons,mdi,fluent-emoji-flat";

export type IconSource = "wiki" | "steam" | "grida" | "iconify";

export type IconSuggestion = {
  id: string;
  previewUrl: string;
  fetchUrl: string;
  source: IconSource;
  label: string;
};

function cleanQuery(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\.(lnk|exe|url)$/i, "")
    .replace(/\s*-\s*(acceso directo|shortcut).*$/i, "")
    .replace(/\s*\(\d+\)\s*$/i, "")
    .trim();
}

function splitIconId(id: string): { prefix: string; name: string } {
  const i = id.indexOf(":");
  if (i <= 0) return { prefix: "mdi", name: id };
  return { prefix: id.slice(0, i), name: id.slice(i + 1) };
}

function iconifyPreview(id: string, size = 72): string {
  const { prefix, name } = splitIconId(id);
  const qs = new URLSearchParams({
    height: String(size),
    width: String(size),
  });
  const colored =
    prefix === "logos" ||
    prefix === "skill-icons" ||
    prefix === "fluent-emoji-flat" ||
    prefix === "vscode-icons" ||
    prefix === "devicon";
  if (!colored) qs.set("color", "%23a1a1aa");
  return `${ICONIFY}/${prefix}/${name}.svg?${qs}`;
}

function steamLibraryArt(appId: number): string {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`;
}

function steamCapsule(appId: number): string {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/capsule_231x87.jpg`;
}

async function searchWikipedia(
  query: string,
  limit: number,
  kind?: string,
): Promise<IconSuggestion[]> {
  try {
    const preferGame = kind === "app" ? false : true;
    const covers = await searchGameCovers(query, limit, preferGame);
    return covers.map((c) => ({
      id: c.id,
      previewUrl: c.previewUrl,
      fetchUrl: c.fetchUrl,
      source: "wiki" as const,
      label: c.label,
    }));
  } catch {
    return [];
  }
}

async function searchSteam(query: string, limit: number): Promise<IconSuggestion[]> {
  try {
    const url = new URL(STEAM_SEARCH);
    url.searchParams.set("term", query);
    url.searchParams.set("l", "english");
    url.searchParams.set("cc", "US");
    const res = await fetch(url.toString());
    if (!res.ok) return [];
    const data = (await res.json()) as {
      items?: {
        id: number;
        name: string;
        type?: string;
        tiny_image?: string;
      }[];
    };
    return (data.items ?? [])
      .filter((i) => i.type === "app" || !i.type)
      .slice(0, limit)
      .map((item) => ({
        id: `steam:${item.id}`,
        previewUrl: item.tiny_image || steamCapsule(item.id),
        fetchUrl: steamLibraryArt(item.id),
        source: "steam" as const,
        label: item.name,
      }));
  } catch {
    return [];
  }
}

async function searchGrida(query: string, limit: number): Promise<IconSuggestion[]> {
  try {
    const url = new URL(GRIDA_SEARCH);
    url.searchParams.set("q", query);
    url.searchParams.set("limit", String(limit));
    const res = await fetch(url.toString());
    if (!res.ok) return [];
    const data = (await res.json()) as {
      items?: {
        id: string;
        name: string;
        download?: string;
        variants?: { download?: string; properties?: { theme?: string } }[];
      }[];
    };

    const out: IconSuggestion[] = [];
    for (const item of data.items ?? []) {
      const dark = item.variants?.find(
        (v) => v.properties?.theme === "dark" && v.download,
      );
      const download = dark?.download || item.download || item.variants?.[0]?.download;
      if (!download) continue;
      out.push({
        id: `grida:${item.id}`,
        previewUrl: download,
        fetchUrl: download,
        source: "grida",
        label: item.name || item.id,
      });
      if (out.length >= limit) break;
    }
    out.sort((a, b) => Number(b.id.includes("svgl")) - Number(a.id.includes("svgl")));
    return out;
  } catch {
    return [];
  }
}

async function searchIconify(query: string, limit: number): Promise<IconSuggestion[]> {
  try {
    const url = new URL(`${ICONIFY}/search`);
    url.searchParams.set("query", query);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("prefixes", ICONIFY_PREFIXES);
    const res = await fetch(url.toString());
    if (!res.ok) return [];
    const data = (await res.json()) as { icons?: string[] };
    let icons = data.icons ?? [];

    if (icons.length < Math.min(6, limit)) {
      const broad = new URL(`${ICONIFY}/search`);
      broad.searchParams.set("query", query);
      broad.searchParams.set("limit", String(limit));
      const res2 = await fetch(broad.toString());
      if (res2.ok) {
        const data2 = (await res2.json()) as { icons?: string[] };
        const seen = new Set(icons);
        for (const id of data2.icons ?? []) {
          if (seen.has(id)) continue;
          seen.add(id);
          icons.push(id);
          if (icons.length >= limit) break;
        }
      }
    }

    icons.sort((a, b) => {
      const score = (id: string) => {
        if (id.startsWith("logos:")) return 0;
        if (id.startsWith("skill-icons:")) return 1;
        if (id.startsWith("simple-icons:")) return 2;
        if (id.startsWith("game-icons:")) return 3;
        return 4;
      };
      return score(a) - score(b);
    });

    return icons.slice(0, limit).map((id) => {
      const preview = iconifyPreview(id);
      return {
        id: `iconify:${id}`,
        previewUrl: preview,
        fetchUrl: preview
          .replace(/height=\d+/, "height=192")
          .replace(/width=\d+/, "width=192"),
        source: "iconify" as const,
        label: id.split(":")[1] ?? id,
      };
    });
  } catch {
    return [];
  }
}

export async function searchIconSuggestions(
  query: string,
  limit = 28,
  kind?: "app" | "game" | string,
): Promise<IconSuggestion[]> {
  const q = cleanQuery(query);
  if (q.length < 2) return [];

  const preferGames = kind === "game";
  const wikiLimit = preferGames ? Math.ceil(limit * 0.55) : Math.ceil(limit * 0.2);
  const steamLimit = preferGames ? Math.ceil(limit * 0.3) : Math.ceil(limit * 0.25);
  const gridaLimit = Math.ceil(limit * 0.3);
  const iconifyLimit = Math.ceil(limit * 0.35);

  const [wiki, steam, grida, iconify] = await Promise.all([
    searchWikipedia(q, wikiLimit, kind),
    searchSteam(q, steamLimit),
    searchGrida(q, gridaLimit),
    searchIconify(q, iconifyLimit),
  ]);

  const merged: IconSuggestion[] = preferGames
    ? [...wiki, ...steam, ...grida, ...iconify]
    : [...grida, ...wiki, ...steam, ...iconify];

  const seen = new Set<string>();
  const out: IconSuggestion[] = [];
  for (const s of merged) {
    const key = s.id.toLowerCase();
    const labelKey = `l:${s.label.toLowerCase()}`;
    if (seen.has(key) || seen.has(labelKey)) continue;
    seen.add(key);
    seen.add(labelKey);
    out.push(s);
    if (out.length >= limit) break;
  }
  return out;
}

async function rasterizeToPng(src: string, size: number, cover = false): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = "anonymous";
    el.decoding = "async";
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("icon load failed"));
    el.src = src;
  });

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  ctx.clearRect(0, 0, size, size);

  if (cover) {
    const scale = Math.max(size / img.naturalWidth, size / img.naturalHeight);
    const dw = img.naturalWidth * scale;
    const dh = img.naturalHeight * scale;
    ctx.drawImage(img, (size - dw) / 2, (size - dh) / 2, dw, dh);
  } else {
    const pad = size * 0.06;
    const box = size - pad * 2;
    const scale = Math.min(box / img.naturalWidth, box / img.naturalHeight);
    const dw = img.naturalWidth * scale;
    const dh = img.naturalHeight * scale;
    ctx.drawImage(img, (size - dw) / 2, (size - dh) / 2, dw, dh);
  }

  return canvas.toDataURL("image/png");
}

export async function fetchIconAsDataUrl(
  suggestion: IconSuggestion | string,
  size = 192,
): Promise<string> {
  if (typeof suggestion === "string") {
    if (suggestion.startsWith("steam:")) {
      const appId = Number(suggestion.slice(6));
      try {
        return await fetchRemoteImagePng(steamLibraryArt(appId), size);
      } catch {
        return fetchRemoteImagePng(steamCapsule(appId), size);
      }
    }
    const rawId = suggestion.startsWith("iconify:")
      ? suggestion.slice("iconify:".length)
      : suggestion;
    const { prefix, name } = splitIconId(rawId);
    const qs = new URLSearchParams({
      height: String(size),
      width: String(size),
    });
    const colored =
      prefix === "logos" ||
      prefix === "skill-icons" ||
      prefix === "fluent-emoji-flat" ||
      prefix === "vscode-icons" ||
      prefix === "devicon";
    if (!colored) qs.set("color", "%23e4e4e7");
    const svgUrl = `${ICONIFY}/${prefix}/${name}.svg?${qs}`;
    const res = await fetch(svgUrl);
    if (!res.ok) throw new Error("No se pudo descargar el icono");
    const svg = await res.text();
    const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    return rasterizeToPng(dataUrl, size, false);
  }

  const { source, fetchUrl } = suggestion;

  if (source === "wiki" || source === "steam") {
    try {
      return await fetchRemoteImagePng(fetchUrl, size);
    } catch {
      try {
        return await fetchRemoteImagePng(suggestion.previewUrl, size);
      } catch {
        throw new Error(
          source === "wiki"
            ? "No se pudo descargar la imagen de Wikipedia"
            : "No se pudo descargar el arte de Steam",
        );
      }
    }
  }

  if (fetchUrl.endsWith(".svg") || fetchUrl.includes(".svg?")) {
    const res = await fetch(fetchUrl);
    if (!res.ok) throw new Error("No se pudo descargar el icono");
    const svg = await res.text();
    const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    return rasterizeToPng(dataUrl, size, false);
  }

  try {
    return await fetchRemoteImagePng(fetchUrl, size);
  } catch {
    return rasterizeToPng(fetchUrl, size, false);
  }
}
