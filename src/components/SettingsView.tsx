import { useEffect, useState } from "react";
import {
  ArrowUpCircle,
  CheckCircle2,
  Download,
  ExternalLink,
  HardDriveDownload,
  LoaderCircle,
  Monitor,
  Moon,
  RefreshCw,
  Sun,
  Upload,
} from "./icons";
import { getVersion } from "@tauri-apps/api/app";
import { open, save } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { LazyStore } from "@tauri-apps/plugin-store";
import type { ClipboardEntry, ShortcutItem, ThemeMode } from "../types";
import { btnGhost, btnPrimary } from "../lib/ui";
import { backupFileName, buildBackup, parseBackup } from "../lib/backup";
import { readTextFile, writeTextFile } from "../lib/tauri";
import {
  checkForUpdates,
  DEFAULT_GITHUB_REPO,
  GITHUB_RELEASES_URL,
  GITHUB_REPO_URL,
  type UpdateCheckResult,
} from "../lib/updates";

const store = new LazyStore("deskall.json");

interface Props {
  theme: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
  items: ShortcutItem[];
  clipboardEntries: ClipboardEntry[];
  onRestoreShortcuts: (items: ShortcutItem[]) => Promise<void>;
  onRestoreClipboard: (entries: ClipboardEntry[]) => Promise<void>;
}

const OPTIONS: {
  id: ThemeMode;
  label: string;
  hint: string;
  icon: typeof Sun;
}[] = [
  { id: "light", label: "Claro", hint: "Fondo claro", icon: Sun },
  { id: "dark", label: "Oscuro", hint: "Poca luz", icon: Moon },
  { id: "system", label: "Sistema", hint: "Windows / macOS", icon: Monitor },
];

export function SettingsView({
  theme,
  onThemeChange,
  items,
  clipboardEntries,
  onRestoreShortcuts,
  onRestoreClipboard,
}: Props) {
  const [version, setVersion] = useState("…");
  const [repo, setRepo] = useState(DEFAULT_GITHUB_REPO);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<UpdateCheckResult | null>(null);
  const [backupBusy, setBackupBusy] = useState<"export" | "import" | null>(
    null,
  );
  const [backupMsg, setBackupMsg] = useState<string | null>(null);

  useEffect(() => {
    void getVersion().then(setVersion).catch(() => setVersion("0.1.0"));
    void (async () => {
      const saved = await store.get<string>("githubRepo");
      if (!saved?.trim() || saved.trim().toLowerCase() === "eduar/deskall") {
        setRepo(DEFAULT_GITHUB_REPO);
        await store.set("githubRepo", DEFAULT_GITHUB_REPO);
        await store.save();
      } else {
        setRepo(saved.trim());
      }
    })();
  }, []);

  async function saveRepo(next: string) {
    const clean = next.trim() || DEFAULT_GITHUB_REPO;
    setRepo(clean);
    await store.set("githubRepo", clean);
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

  async function exportBackup() {
    setBackupBusy("export");
    setBackupMsg(null);
    try {
      const path = await save({
        title: "Guardar copia de seguridad de DeskAll",
        defaultPath: backupFileName(),
        filters: [{ name: "Copia DeskAll", extensions: ["json"] }],
      });
      if (typeof path !== "string") return;

      const backup = buildBackup({
        shortcuts: items,
        clipboard: clipboardEntries,
        theme,
        githubRepo: repo.trim() || DEFAULT_GITHUB_REPO,
        appVersion: version,
      });
      await writeTextFile(path, JSON.stringify(backup, null, 2));
      setBackupMsg(
        `Copia guardada (${items.length} accesos, ${clipboardEntries.length} clipboard).`,
      );
    } catch (err) {
      setBackupMsg(String(err));
    } finally {
      setBackupBusy(null);
    }
  }

  async function importBackup() {
    setBackupBusy("import");
    setBackupMsg(null);
    try {
      const path = await open({
        title: "Restaurar copia de DeskAll",
        multiple: false,
        filters: [{ name: "Copia DeskAll", extensions: ["json"] }],
      });
      if (typeof path !== "string") return;

      const raw = await readTextFile(path);
      const backup = parseBackup(raw);

      await onRestoreShortcuts(backup.data.shortcuts);
      if (backup.data.clipboard) {
        await onRestoreClipboard(backup.data.clipboard);
      }
      if (backup.data.theme) {
        await onThemeChange(backup.data.theme);
      }
      if (backup.data.githubRepo?.trim()) {
        await saveRepo(backup.data.githubRepo);
      }

      setBackupMsg(
        `Restaurado: ${backup.data.shortcuts.length} accesos` +
          (backup.data.clipboard
            ? `, ${backup.data.clipboard.length} clipboard`
            : "") +
          ".",
      );
    } catch (err) {
      setBackupMsg(String(err));
    } finally {
      setBackupBusy(null);
    }
  }

  return (
    <section className="relative flex h-full flex-col gap-5 overflow-auto pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <header>
        <h1 className="m-0 font-display text-2xl tracking-tight">Ajustes</h1>
        <p className="mt-1 text-sm text-muted">
          Tema, copia de seguridad y actualizaciones · v{version}
        </p>
      </header>

      <div className="rounded-[18px] border border-line bg-surface p-5 shadow-desk">
        <h2 className="m-0 font-display text-lg tracking-tight">Apariencia</h2>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
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
              Copia de seguridad
            </h2>
            <p className="mt-1 text-sm text-muted">
              Escritorio, clipboard y ajustes en un JSON.
            </p>
          </div>
          <HardDriveDownload
            className="size-5 shrink-0 text-accent"
            strokeWidth={1.8}
          />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className={btnPrimary}
            disabled={backupBusy !== null}
            onClick={() => void exportBackup()}
          >
            {backupBusy === "export" ? (
              <LoaderCircle className="size-4 animate-spin" strokeWidth={1.8} />
            ) : (
              <Download className="size-4" strokeWidth={1.8} />
            )}
            Guardar copia
          </button>
          <button
            type="button"
            className={btnGhost}
            disabled={backupBusy !== null}
            onClick={() => void importBackup()}
          >
            {backupBusy === "import" ? (
              <LoaderCircle className="size-4 animate-spin" strokeWidth={1.8} />
            ) : (
              <Upload className="size-4" strokeWidth={1.8} />
            )}
            Restaurar
          </button>
        </div>
        {backupMsg && (
          <p className="mt-3 m-0 rounded-xl border border-line bg-paper/70 px-3 py-2.5 text-sm text-ink-soft">
            {backupMsg}
          </p>
        )}
      </div>

      <div className="rounded-[18px] border border-line bg-surface p-5 shadow-desk">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="m-0 font-display text-lg tracking-tight">
              Actualizaciones
            </h2>
            <p className="mt-1 text-sm text-muted">
              <button
                type="button"
                className="cursor-pointer border-0 bg-transparent p-0 text-accent underline-offset-2 hover:underline"
                onClick={() => void openUrl(GITHUB_REPO_URL)}
              >
                {DEFAULT_GITHUB_REPO}
              </button>
            </p>
          </div>
          <ArrowUpCircle className="size-5 shrink-0 text-accent" strokeWidth={1.8} />
        </div>

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
          <button
            type="button"
            className={btnGhost}
            onClick={() => void openUrl(GITHUB_RELEASES_URL)}
          >
            <ExternalLink className="size-4" strokeWidth={1.8} />
            Releases
          </button>
          {result?.status === "available" && (
            <button
              type="button"
              className={btnGhost}
              onClick={() => void openUrl(result.release.htmlUrl)}
            >
              <ExternalLink className="size-4" strokeWidth={1.8} />
              Descargar {result.latest}
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
    </section>
  );
}
