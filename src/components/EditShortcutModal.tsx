import { useEffect, useRef, useState } from "react";
import {
  AppWindow,
  Globe,
  Gamepad2,
  LoaderCircle,
  Search,
  Upload,
  X,
} from "./icons";
import type { ItemKind, ShortcutItem } from "../types";
import { KIND_LABELS } from "../types";
import { FitIcon } from "./FitIcon";
import { prepareCustomAvatar } from "../lib/fitIcon";
import {
  fetchIconAsDataUrl,
  searchIconSuggestions,
  type IconSuggestion,
} from "../lib/iconSearch";
import { listFileIcons } from "../lib/tauri";
import { btnGhost, btnPrimary, hideScrollbar } from "../lib/ui";

type IconTab = "file" | "online";

interface Props {
  item: ShortcutItem;
  busy?: boolean;
  onClose: () => void;
  onSave: (next: {
    name: string;
    kind: ItemKind;
    iconDataUrl: string | null;
    iconCustom: boolean;
    iconAvatar: boolean;
  }) => Promise<void>;
}

const fieldInput =
  "w-full rounded-xl border border-line bg-paper px-3.5 py-2.5 text-sm outline-none transition focus:border-accent/45 focus:shadow-[0_0_0_3px_var(--color-accent-soft)]";

export function EditShortcutModal({ item, busy, onClose, onSave }: Props) {
  const [name, setName] = useState(item.name);
  const [kind, setKind] = useState<ItemKind>(
    item.kind === "game" ? "game" : item.kind === "app" ? "app" : item.kind,
  );
  const [icon, setIcon] = useState<string | null>(item.iconDataUrl ?? null);
  const [iconCustom, setIconCustom] = useState(Boolean(item.iconCustom));
  const [iconAvatar, setIconAvatar] = useState(false);
  const [fileIcons, setFileIcons] = useState<string[]>(
    item.iconDataUrl ? [item.iconDataUrl] : [],
  );
  const [fileLoading, setFileLoading] = useState(false);
  const [iconTab, setIconTab] = useState<IconTab>("online");
  const [query, setQuery] = useState(item.name);
  const [suggestions, setSuggestions] = useState<IconSuggestion[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [picking, setPicking] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const customUrls = useRef<Set<string>>(new Set());

  const canEditKind = !item.isGroup && (item.kind === "app" || item.kind === "game");
  const canEditIcon = !item.isGroup && item.kind !== "url";
  const showOnline = canEditIcon;

  useEffect(() => {
    if (item.isGroup || item.path.startsWith("deskall://") || item.kind === "url") {
      return;
    }
    let cancelled = false;
    setFileLoading(true);
    void listFileIcons(item.path)
      .then((icons) => {
        if (cancelled || !icons.length) return;
        setFileIcons(icons);
        setIcon((prev) => prev ?? icons[0] ?? null);
        setIconTab("file");
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setFileLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [item]);

  useEffect(() => {
    if (!showOnline || iconTab !== "online") return;
    const q = query.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setSuggestLoading(false);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(() => {
      setSuggestLoading(true);
      void searchIconSuggestions(q, 32, kind === "game" || kind === "app" ? kind : item.kind)
        .then((list) => {
          if (!cancelled) setSuggestions(list);
        })
        .catch(() => {
          if (!cancelled) setSuggestions([]);
        })
        .finally(() => {
          if (!cancelled) setSuggestLoading(false);
        });
    }, 320);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [query, kind, iconTab, showOnline, item.kind]);

  async function onUpload(file: File | undefined) {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    const raw = await new Promise<string>((resolve, reject) => {
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("read failed"));
      reader.readAsDataURL(file);
    });
    const prepared = await prepareCustomAvatar(raw, 192);
    customUrls.current.add(prepared);
    setIcon(prepared);
    setIconCustom(true);
    setIconAvatar(true);
    setFileIcons((prev) =>
      prev.includes(prepared) ? prev : [prepared, ...prev],
    );
    setIconTab("file");
  }

  async function pickOnline(sug: IconSuggestion) {
    setPicking(sug.id);
    try {
      const raw = await fetchIconAsDataUrl(sug, 192);
      const prepared = await prepareCustomAvatar(raw, 192);
      customUrls.current.add(prepared);
      setIcon(prepared);
      setIconCustom(true);
      setIconAvatar(true);
      setFileIcons((prev) =>
        prev.includes(prepared) ? prev : [prepared, ...prev],
      );
    } catch {
      /* ignore */
    } finally {
      setPicking(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const clean = name.trim();
    if (!clean || saving || busy) return;
    setSaving(true);
    try {
      await onSave({
        name: clean,
        kind,
        iconDataUrl: icon,
        iconCustom,
        iconAvatar,
      });
    } finally {
      setSaving(false);
    }
  }

  const sourceBadge = (source: IconSuggestion["source"]) => {
    if (source === "wiki") return "Wiki";
    if (source === "steam") return "Steam";
    if (source === "grida") return "Logo";
    return "Icon";
  };

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center p-4">
      <button
        type="button"
        className="absolute inset-0 border-0 bg-ink/35 backdrop-blur-[4px]"
        aria-label="Cerrar"
        onClick={onClose}
      />
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="relative z-[101] flex max-h-[min(720px,calc(100vh-2rem))] w-[min(480px,calc(100vw-2rem))] flex-col overflow-hidden rounded-[22px] border border-line bg-paper shadow-desk animate-rise-fast"
        role="dialog"
        aria-modal
        aria-label="Editar"
      >
        {/* Header */}
        <div className="relative flex items-start gap-4 border-b border-line px-5 pt-5 pb-4">
          <button
            type="button"
            className="absolute top-3.5 right-3.5 grid size-8 cursor-pointer place-items-center rounded-full border-0 bg-transparent text-muted transition hover:bg-accent-soft hover:text-ink"
            onClick={onClose}
            aria-label="Cerrar"
          >
            <X className="size-4" />
          </button>

          <div className="grid size-[4.5rem] shrink-0 place-items-center overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
            {icon ? (
              <FitIcon src={icon} className="size-[4.25rem]" size={160} />
            ) : (
              <span
                className="grid size-full place-items-center text-white"
                style={{ background: item.color }}
              >
                {item.isGroup ? (
                  <AppWindow className="size-8" />
                ) : kind === "game" ? (
                  <Gamepad2 className="size-8" />
                ) : (
                  <AppWindow className="size-8" />
                )}
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1 pr-8 pt-0.5">
            <p className="m-0 text-[11px] font-semibold tracking-wide text-muted uppercase">
              Editar · {item.isGroup ? "Carpeta" : KIND_LABELS[kind] ?? KIND_LABELS[item.kind]}
            </p>
            <h3 className="mt-1 m-0 truncate font-display text-xl tracking-tight text-ink">
              {name.trim() || item.name}
            </h3>
            {!item.isGroup && (
              <p
                className="mt-1.5 m-0 truncate font-mono text-[11px] text-muted"
                title={item.path}
              >
                {item.path}
              </p>
            )}
          </div>
        </div>

        {/* Body */}
        <div className={`min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 ${hideScrollbar}`}>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">Nombre</span>
            <input
              className={fieldInput}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              required
              placeholder="Nombre"
            />
          </label>

          {canEditKind && (
            <div>
              <span className="mb-1.5 block text-sm font-medium text-ink">Tipo</span>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    {
                      id: "app" as const,
                      label: "App",
                      hint: "Programas",
                      Icon: AppWindow,
                      on: "border-accent/50 bg-accent-soft text-accent-deep",
                    },
                    {
                      id: "game" as const,
                      label: "Juego",
                      hint: "Videojuegos",
                      Icon: Gamepad2,
                      on: "border-violet-500/40 bg-violet-500/10 text-violet-300",
                    },
                  ] as const
                ).map(({ id, label, hint, Icon, on }) => {
                  const active = kind === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setKind(id)}
                      className={[
                        "flex cursor-pointer items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition",
                        active
                          ? on
                          : "border-line bg-surface text-muted hover:border-ink/15 hover:text-ink",
                      ].join(" ")}
                    >
                      <Icon className="size-5 shrink-0" />
                      <span>
                        <span className="block text-sm font-semibold">{label}</span>
                        <span className="block text-[11px] opacity-80">{hint}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {canEditIcon && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-ink">Icono</span>
                <button
                  type="button"
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink-soft transition hover:bg-paper hover:text-ink"
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload className="size-3.5" />
                  Subir
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    void onUpload(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </div>

              <div className="flex gap-1 rounded-xl border border-line bg-surface/80 p-1">
                {(
                  [
                    { id: "file" as const, label: "Del archivo", icon: Upload },
                    { id: "online" as const, label: "Online", icon: Globe },
                  ] as const
                ).map(({ id, label, icon: TabIcon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setIconTab(id)}
                    className={[
                      "flex-1 cursor-pointer rounded-lg border-0 px-3 py-2 text-xs font-semibold transition",
                      iconTab === id
                        ? "bg-paper text-ink shadow-sm"
                        : "bg-transparent text-muted hover:text-ink",
                    ].join(" ")}
                  >
                    <TabIcon className="mr-1.5 inline-block size-3.5 align-[-0.15em]" />
                    {label}
                  </button>
                ))}
              </div>

              {iconTab === "file" ? (
                fileLoading ? (
                  <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
                    <LoaderCircle className="size-4 animate-spin" />
                    Leyendo iconos del archivo…
                  </div>
                ) : fileIcons.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-line bg-surface/40 px-4 py-8 text-center">
                    <p className="m-0 text-sm text-muted">
                      No hay iconos en el archivo. Súbelos o busca online.
                    </p>
                    <button
                      type="button"
                      className={`${btnGhost} mt-3`}
                      onClick={() => fileRef.current?.click()}
                    >
                      <Upload className="size-4" />
                      Subir imagen
                    </button>
                  </div>
                ) : (
                  <div
                    className={`grid max-h-[220px] grid-cols-5 gap-2 overflow-y-auto rounded-2xl border border-line bg-surface/40 p-2.5 sm:grid-cols-6 ${hideScrollbar}`}
                  >
                    {fileIcons.map((src, idx) => {
                      const active = icon === src;
                      return (
                        <button
                          key={`${idx}-${src.length}`}
                          type="button"
                          title={`Icono ${idx + 1}`}
                          onClick={() => {
                            setIcon(src);
                            setIconCustom(true);
                            setIconAvatar(customUrls.current.has(src));
                          }}
                          className={[
                            "grid aspect-square cursor-pointer place-items-center rounded-xl border p-1.5 transition",
                            active
                              ? "border-accent bg-accent-soft ring-2 ring-accent/20"
                              : "border-transparent bg-paper hover:border-line",
                          ].join(" ")}
                        >
                          <FitIcon
                            src={src}
                            className="size-full max-h-11 max-w-11"
                            size={96}
                          />
                        </button>
                      );
                    })}
                  </div>
                )
              ) : (
                <div className="space-y-2.5">
                  <div className="relative">
                    <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" />
                    <input
                      className={`${fieldInput} pl-10`}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={
                        kind === "game"
                          ? "Buscar juego (CS2, Elden Ring…)"
                          : "Buscar app o juego (Discord, Notion…)"
                      }
                      autoComplete="off"
                    />
                  </div>
                  <p className="m-0 text-[11px] text-muted">
                    Wikipedia · Steam · logos · Iconify
                  </p>

                  {suggestLoading ? (
                    <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
                      <LoaderCircle className="size-4 animate-spin" />
                      Buscando…
                    </div>
                  ) : suggestions.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-line bg-surface/40 px-4 py-8 text-center text-sm text-muted">
                      {query.trim().length < 2
                        ? "Escribe al menos 2 letras."
                        : "Sin resultados. Prueba otro nombre."}
                    </div>
                  ) : (
                    <div
                      className={`grid max-h-[240px] grid-cols-4 gap-2 overflow-y-auto rounded-2xl border border-line bg-surface/40 p-2.5 sm:grid-cols-5 ${hideScrollbar}`}
                    >
                      {suggestions.map((sug) => {
                        const loading = picking === sug.id;
                        return (
                          <button
                            key={sug.id}
                            type="button"
                            disabled={!!picking}
                            title={sug.label}
                            onClick={() => void pickOnline(sug)}
                            className={[
                              "group relative flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border border-transparent bg-paper p-2 transition hover:border-accent/35 disabled:cursor-wait",
                              loading ? "opacity-55" : "",
                            ].join(" ")}
                          >
                            <span className="grid size-11 place-items-center overflow-hidden rounded-lg bg-surface">
                              {loading ? (
                                <LoaderCircle className="size-4 animate-spin text-muted" />
                              ) : (
                                <img
                                  src={sug.previewUrl}
                                  alt=""
                                  className="size-9 object-contain"
                                  loading="lazy"
                                  decoding="async"
                                  referrerPolicy="no-referrer"
                                />
                              )}
                            </span>
                            <span className="w-full truncate text-center text-[9px] font-medium text-muted group-hover:text-ink-soft">
                              {sourceBadge(sug.source)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface/50 px-5 py-3.5">
          <button
            type="button"
            className={btnGhost}
            onClick={onClose}
            disabled={saving || busy}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className={btnPrimary}
            disabled={saving || busy || !name.trim()}
          >
            {saving || busy ? (
              <>
                <LoaderCircle className="size-4 animate-spin" />
                Guardando…
              </>
            ) : (
              "Guardar cambios"
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
