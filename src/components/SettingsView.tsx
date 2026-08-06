import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpCircle,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Info,
  LoaderCircle,
  Monitor,
  Moon,
  RefreshCw,
  RotateCcw,
  Sun,
} from "lucide-react";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { LazyStore } from "@tauri-apps/plugin-store";
import type { ShortcutItem, ThemeMode } from "../types";
import { KIND_LABELS } from "../types";
import { btnGhost, btnPrimary } from "../lib/ui";
import { formatUsage } from "../lib/usage";
import { FitIcon } from "./FitIcon";
import {
  checkForUpdates,
  DEFAULT_GITHUB_REPO,
  type UpdateCheckResult,
} from "../lib/updates";

const store = new LazyStore("deskall.json");

interface Props {
  theme: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
  items: ShortcutItem[];
  onResetUsage: (id?: string) => void;
}

const OPTIONS: {
  id: ThemeMode;
  label: string;
  hint: string;
  icon: typeof Sun;
}[] = [
  { id: "light", label: "Claro", hint: "Fondo claro y contraste suave", icon: Sun },
  { id: "dark", label: "Oscuro", hint: "Ideal de noche o con poca luz", icon: Moon },
  {
    id: "system",
    label: "Sistema",
    hint: "Sigue el tema de Windows / macOS",
    icon: Monitor,
  },
];

export function SettingsView({
  theme,
  onThemeChange,
  items,
  onResetUsage,
}: Props) {
  const [version, setVersion] = useState("…");
  const [repo, setRepo] = useState(DEFAULT_GITHUB_REPO);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<UpdateCheckResult | null>(null);

  const ranked = useMemo(
    () =>
      [...items]
        .filter((i) => (i.usageMs ?? 0) > 0 || (i.launchCount ?? 0) > 0)
        .sort(
          (a, b) =>
            (b.usageMs ?? 0) - (a.usageMs ?? 0) ||
            (b.launchCount ?? 0) - (a.launchCount ?? 0),
        )
        .slice(0, 8),
    [items],
  );

  const totalUsage = useMemo(
    () => items.reduce((acc, i) => acc + (i.usageMs ?? 0), 0),
    [items],
  );

  useEffect(() => {
    void getVersion().then(setVersion).catch(() => setVersion("0.1.0"));
    void (async () => {
      const saved = await store.get<string>("githubRepo");
      if (saved?.trim()) setRepo(saved.trim());
    })();
  }, []);

  async function saveRepo(next: string) {
    setRepo(next);
    await store.set("githubRepo", next.trim());
    await store.save();
  }

  async function handleCheck() {
    setChecking(true);
    setResult(null);
    const clean = repo.trim() || DEFAULT_GITHUB_REPO;
    if (clean !== repo) await saveRepo(clean);
    const res = await checkForUpdates(version, clean);
    setResult(res);
    setChecking(false);
  }

  return (
    <section className="relative flex h-full flex-col gap-5 overflow-auto pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <header>
        <h1 className="m-0 font-display text-2xl tracking-tight">Ajustes</h1>
        <p className="mt-1 text-sm text-muted">
          Apariencia y actualizaciones de DeskAll.
        </p>
      </header>

      <div className="rounded-[18px] border border-line bg-surface p-5 shadow-desk">
        <h2 className="m-0 font-display text-lg tracking-tight">Apariencia</h2>
        <p className="mt-1 mb-4 text-sm text-muted">Modo claro u oscuro</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {OPTIONS.map(({ id, label, hint, icon: Icon }) => {
            const on = theme === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onThemeChange(id)}
                className={[
                  "flex cursor-pointer flex-col gap-2 rounded-2xl border p-4 text-left transition duration-150 hover:-translate-y-0.5",
                  on
                    ? "border-accent/40 bg-accent-soft shadow-desk"
                    : "border-line bg-paper/60",
                ].join(" ")}
              >
                <Icon className="size-5 text-accent" strokeWidth={1.8} />
                <span className="font-semibold">{label}</span>
                <span className="text-xs text-muted">{hint}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-[18px] border border-line bg-surface p-5 shadow-desk">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="m-0 font-display text-lg tracking-tight">
              Tiempo de uso
            </h2>
            <p className="mt-1 text-sm text-muted">
              Se cuenta desde que abres un acceso hasta que vuelves a DeskAll ·{" "}
              {formatUsage(totalUsage)} en total
            </p>
          </div>
          <Clock3 className="size-5 shrink-0 text-accent" strokeWidth={1.8} />
        </div>

        {ranked.length === 0 ? (
          <p className="mt-4 m-0 text-sm text-muted">
            Aún no hay uso registrado. Abre apps o juegos desde DeskAll.
          </p>
        ) : (
          <ul className="mt-4 m-0 flex list-none flex-col gap-2 p-0">
            {ranked.map((item, idx) => (
              <li
                key={item.id}
                className="flex items-center gap-3 rounded-xl border border-line bg-paper/50 px-3 py-2.5"
              >
                <span className="grid size-7 place-items-center rounded-lg bg-accent-soft text-xs font-semibold text-accent-deep">
                  {idx + 1}
                </span>
                {item.iconDataUrl ? (
                  <FitIcon src={item.iconDataUrl} className="size-8" size={64} />
                ) : (
                  <span
                    className="size-8 rounded-lg"
                    style={{ background: item.color }}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="m-0 truncate text-sm font-medium">{item.name}</p>
                  <p className="m-0 text-xs text-muted">
                    {KIND_LABELS[item.kind]} · {item.launchCount ?? 0} aperturas
                  </p>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums">
                  {formatUsage(item.usageMs ?? 0)}
                </span>
                <button
                  type="button"
                  className="grid size-8 cursor-pointer place-items-center rounded-lg border-0 bg-transparent text-muted hover:bg-accent-soft hover:text-ink"
                  title="Reiniciar uso"
                  onClick={() => onResetUsage(item.id)}
                >
                  <RotateCcw className="size-3.5" strokeWidth={1.8} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {ranked.length > 0 && (
          <button
            type="button"
            className={`${btnGhost} mt-4`}
            onClick={() => onResetUsage()}
          >
            <RotateCcw className="size-4" strokeWidth={1.8} />
            Reiniciar todo el uso
          </button>
        )}
      </div>

      <div className="rounded-[18px] border border-line bg-surface p-5 shadow-desk">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="m-0 font-display text-lg tracking-tight">
              Actualizaciones
            </h2>
            <p className="mt-1 text-sm text-muted">
              Busca nuevas versiones en GitHub Releases · v{version}
            </p>
          </div>
          <ArrowUpCircle className="size-5 shrink-0 text-accent" strokeWidth={1.8} />
        </div>

        <label className="mt-4 flex flex-col gap-1.5">
          <span className="text-sm text-muted">Repositorio GitHub</span>
          <input
            className="rounded-xl border border-line bg-paper px-3 py-2.5 outline-none focus:border-accent/45 focus:shadow-[0_0_0_3px_var(--color-accent-soft)]"
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
            onBlur={() => void saveRepo(repo)}
            placeholder="owner/repo"
            spellCheck={false}
          />
        </label>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={btnPrimary}
            disabled={checking}
            onClick={() => void handleCheck()}
          >
            {checking ? (
              <LoaderCircle className="size-4 animate-spin" strokeWidth={1.8} />
            ) : (
              <RefreshCw className="size-4" strokeWidth={1.8} />
            )}
            {checking ? "Buscando…" : "Buscar actualizaciones"}
          </button>
          {result?.status === "available" && (
            <button
              type="button"
              className={btnGhost}
              onClick={() => void openUrl(result.release.htmlUrl)}
            >
              <ExternalLink className="size-4" strokeWidth={1.8} />
              Ver release
            </button>
          )}
        </div>

        {result && (
          <div
            className={[
              "mt-4 rounded-2xl border px-4 py-3 text-sm",
              result.status === "available"
                ? "border-ink/15 bg-accent-soft"
                : result.status === "upToDate"
                  ? "border-line bg-paper/70"
                  : "border-danger/25 bg-danger/10 text-danger",
            ].join(" ")}
          >
            {result.status === "available" && (
              <div className="flex items-start gap-2">
                <ArrowUpCircle className="mt-0.5 size-4 shrink-0" strokeWidth={1.8} />
                <div>
                  <p className="m-0 font-medium text-ink">
                    Nueva versión {result.latest}
                  </p>
                  <p className="mt-1 m-0 text-muted">
                    Tienes {result.current}. {result.release.name}
                  </p>
                </div>
              </div>
            )}
            {result.status === "upToDate" && (
              <div className="flex items-start gap-2 text-ink">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0" strokeWidth={1.8} />
                <p className="m-0">
                  Estás al día ({result.current}). Último release:{" "}
                  {result.latest}
                </p>
              </div>
            )}
            {result.status === "error" && (
              <p className="m-0">{result.message}</p>
            )}
          </div>
        )}
      </div>

      <div className="rounded-[18px] border border-line bg-surface p-5">
        <div className="flex items-start gap-3">
          <Info className="mt-0.5 size-5 shrink-0 text-accent" strokeWidth={1.8} />
          <div>
            <h2 className="m-0 font-display text-lg tracking-tight">Librería</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              Al agregar apps, archivos o carpetas, DeskAll guarda una copia en
              su librería interna y deja de depender del Escritorio.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
