import {
  AppWindow,
  FolderOpen,
  FolderPlus,
  Gamepad2,
  LayoutGrid,
  Link2,
  Plus,
  Search,
} from "./icons";
import type { DeskTabId, ItemKind, ShortcutItem } from "../types";
import type { InstalledApp } from "../lib/tauri";
import { btnGhost, btnPrimary } from "../lib/ui";
import { ProgramIcon } from "./ProgramIcon";

const fieldInput =
  "rounded-xl border border-line bg-paper px-3 py-2.5 outline-none focus:border-accent/45 focus:shadow-[0_0_0_3px_var(--color-accent-soft)]";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="mt-3.5 flex flex-col gap-1.5">
      <span className="text-sm text-muted">{label}</span>
      {children}
    </label>
  );
}

function KindPicker({
  value,
  onChange,
}: {
  value: ItemKind;
  onChange: (kind: ItemKind) => void;
}) {
  const options = [
    {
      kind: "app" as const,
      label: "App",
      hint: "Programas y herramientas",
      icon: AppWindow,
      active:
        "border-accent bg-accent-soft text-accent-deep shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-accent)_35%,transparent)]",
    },
    {
      kind: "game" as const,
      label: "Juego",
      hint: "Videojuegos",
      icon: Gamepad2,
      active:
        "border-[#7c3aed] bg-[#7c3aed]/12 text-[#a78bfa] shadow-[inset_0_0_0_1px_rgba(124,58,237,0.35)]",
    },
  ];

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-ink">Tipo</span>
      <div className="grid grid-cols-2 gap-2">
        {options.map(({ kind, label, hint, icon: Icon, active }) => {
          const selected = value === kind;
          return (
            <button
              key={kind}
              type="button"
              className={[
                "flex cursor-pointer flex-col items-center gap-1.5 rounded-2xl border px-3 py-3.5 text-center transition",
                selected
                  ? active
                  : "border-line bg-surface text-muted hover:border-ink/20 hover:bg-paper hover:text-ink",
              ].join(" ")}
              onClick={() => onChange(kind)}
            >
              <Icon className="size-6" strokeWidth={1.8} />
              <span className="text-sm font-semibold">{label}</span>
              <span className="text-[11px] leading-tight opacity-80">{hint}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AddChoice({
  icon,
  title,
  hint,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-3 text-left transition hover:bg-paper disabled:cursor-not-allowed disabled:opacity-45"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-deep">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-ink">{title}</span>
        <span className="block text-xs text-muted">{hint}</span>
      </span>
    </button>
  );
}

export type AddModalMode = "add" | "url" | "programs" | "folder" | "move";

interface Props {
  mode: AddModalMode;
  deskTab: DeskTabId;
  currentFolderName: string | null;
  selected: ShortcutItem | null;
  draftName: string;
  draftUrl: string;
  draftKind: ItemKind;
  busy: boolean;
  installed: InstalledApp[];
  installedQuery: string;
  installedLoading: boolean;
  installedScanning: boolean;
  pickedPaths: Set<string>;
  filteredInstalled: InstalledApp[];
  allGroups: ShortcutItem[];
  onDraftName: (name: string) => void;
  onDraftUrl: (url: string) => void;
  onDraftKind: (kind: ItemKind) => void;
  onInstalledQuery: (q: string) => void;
  onTogglePicked: (path: string) => void;
  onClose: () => void;
  onBackToAdd: () => void;
  onNewFolder: () => void;
  onNewUrl: () => void;
  onPickFiles: () => void;
  onPickFolder: () => void;
  onOpenPrograms: () => void;
  onAddPicked: () => void;
  onSubmitUrl: (e: React.FormEvent) => void;
  onSubmitFolder: (e: React.FormEvent) => void;
  onMoveToFolder: (parentId: string | null) => void;
}

export function AddModal(props: Props) {
  const {
    mode,
    deskTab,
    currentFolderName,
    selected,
    draftName,
    draftUrl,
    draftKind,
    busy,
    installed,
    installedQuery,
    installedLoading,
    installedScanning,
    pickedPaths,
    filteredInstalled,
    allGroups,
    onDraftName,
    onDraftUrl,
    onDraftKind,
    onInstalledQuery,
    onTogglePicked,
    onClose,
    onBackToAdd,
    onNewFolder,
    onNewUrl,
    onPickFiles,
    onPickFolder,
    onOpenPrograms,
    onAddPicked,
    onSubmitUrl,
    onSubmitFolder,
    onMoveToFolder,
  } = props;

  return (
    <div className="fixed inset-0 z-30 grid place-items-center">
      <button
        type="button"
        className="absolute inset-0 border-0 bg-ink/28 backdrop-blur-[2px]"
        onClick={onClose}
        aria-label="Cerrar"
      />
      <div
        className={[
          "relative z-31 animate-rise-fast rounded-[18px] border border-line bg-paper p-5 shadow-desk",
          mode === "programs"
            ? "flex max-h-[min(640px,calc(100vh-2rem))] w-[min(520px,calc(100vw-2rem))] flex-col"
            : "w-[min(420px,calc(100vw-2rem))]",
        ].join(" ")}
        role="dialog"
        aria-modal
      >
        {mode === "add" && (
          <>
            <h3 className="m-0 font-display text-xl tracking-tight">Añadir</h3>
            <p className="mt-1 mb-4 text-sm text-muted">
              {currentFolderName
                ? `Dentro de «${currentFolderName}»`
                : "¿Qué quieres poner en el escritorio?"}
            </p>

            <div className="mb-4">
              <KindPicker value={draftKind} onChange={onDraftKind} />
            </div>

            <div className="flex flex-col gap-1.5">
              <AddChoice
                icon={<LayoutGrid className="size-5" strokeWidth={1.8} />}
                title="Programa instalado"
                hint="Elegir de los de tu PC"
                onClick={() => void onOpenPrograms()}
                disabled={busy}
              />
              <AddChoice
                icon={<Plus className="size-5" strokeWidth={1.8} />}
                title="Archivo o acceso"
                hint="Exe, acceso directo…"
                onClick={() => void onPickFiles()}
                disabled={busy}
              />
              {deskTab === "apps" && (
                <AddChoice
                  icon={<FolderPlus className="size-5" strokeWidth={1.8} />}
                  title="Nueva carpeta"
                  hint="Organizar apps por categoría"
                  onClick={onNewFolder}
                />
              )}
              <AddChoice
                icon={<Link2 className="size-5" strokeWidth={1.8} />}
                title="Enlace web"
                hint="Abrir una URL"
                onClick={onNewUrl}
              />
            </div>
          </>
        )}

        {mode === "folder" && (
          <form onSubmit={onSubmitFolder}>
            <h3 className="m-0 font-display tracking-tight">Nueva carpeta</h3>
            <p className="mt-1 mb-1 text-sm text-muted">
              Ej. Productividad, Diseño, Juegos…
            </p>
            <Field label="Nombre">
              <input
                className={fieldInput}
                value={draftName}
                onChange={(e) => onDraftName(e.target.value)}
                placeholder="Nombre"
                autoFocus
                required
              />
            </Field>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className={btnGhost} onClick={onBackToAdd}>
                Atrás
              </button>
              <button type="submit" className={btnPrimary}>
                Crear
              </button>
            </div>
            <button
              type="button"
              className="mt-3 w-full cursor-pointer border-0 bg-transparent text-center text-xs text-muted underline-offset-2 hover:text-ink hover:underline"
              disabled={busy}
              onClick={() => void onPickFolder()}
            >
              O elegir una carpeta del PC…
            </button>
          </form>
        )}

        {mode === "move" && selected && (
          <>
            <h3 className="m-0 font-display tracking-tight">Mover a carpeta</h3>
            <p className="mt-1 mb-3 text-sm text-muted">
              Elige dónde poner «{selected.name}».
            </p>
            <div className="flex max-h-[280px] flex-col gap-1 overflow-auto">
              <button
                type="button"
                className={btnGhost + " justify-start"}
                onClick={() => onMoveToFolder(null)}
              >
                Escritorio (raíz)
              </button>
              {allGroups
                .filter((g) => g.id !== selected.id)
                .map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    className={btnGhost + " justify-start"}
                    onClick={() => onMoveToFolder(g.id)}
                  >
                    <FolderOpen className="size-4" strokeWidth={1.8} />
                    {g.name}
                  </button>
                ))}
              {allGroups.length === 0 && (
                <p className="m-0 px-1 py-3 text-sm text-muted">
                  Aún no hay carpetas. Crea una desde Añadir.
                </p>
              )}
            </div>
            <div className="mt-4">
              <button type="button" className={btnGhost} onClick={onClose}>
                Cancelar
              </button>
            </div>
          </>
        )}

        {mode === "programs" && (
          <>
            <h3 className="m-0 font-display tracking-tight">Programas</h3>
            <p className="mt-1 mb-3 text-sm text-muted">
              {installedScanning ? "Cargando programas…" : "Toca para seleccionar"}
            </p>
            <div className="relative mb-3">
              <Search
                className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted"
                strokeWidth={1.8}
              />
              <input
                className="w-full rounded-full border border-line bg-surface py-2.5 pr-3.5 pl-10 text-sm outline-none focus:border-accent/45"
                value={installedQuery}
                onChange={(e) => onInstalledQuery(e.target.value)}
                placeholder="Buscar…"
                autoFocus
              />
            </div>
            <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-line bg-surface/50">
              {installedLoading && installed.length === 0 ? (
                <p className="m-0 px-4 py-8 text-center text-sm text-muted">
                  Buscando en el menú Inicio…
                </p>
              ) : filteredInstalled.length === 0 ? (
                <p className="m-0 px-4 py-8 text-center text-sm text-muted">
                  {installedScanning
                    ? "Buscando…"
                    : `Sin resultados${installedQuery ? " para esa búsqueda" : ""}.`}
                </p>
              ) : (
                <ul className="m-0 list-none p-1.5">
                  {filteredInstalled.map((app) => {
                    const checked = pickedPaths.has(app.path);
                    return (
                      <li key={app.path}>
                        <button
                          type="button"
                          className={[
                            "flex w-full cursor-pointer items-center gap-3 rounded-lg border-0 px-3 py-2.5 text-left transition-colors",
                            checked
                              ? "bg-accent-soft text-accent-deep"
                              : "bg-transparent text-ink hover:bg-paper",
                          ].join(" ")}
                          onClick={() => onTogglePicked(app.path)}
                        >
                          <span
                            className={[
                              "grid size-4 shrink-0 place-items-center rounded border",
                              checked
                                ? "border-accent bg-accent text-[10px] text-white"
                                : "border-line bg-paper",
                            ].join(" ")}
                            aria-hidden
                          >
                            {checked ? "✓" : ""}
                          </span>
                          <ProgramIcon path={app.path} className="size-9" defer />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">
                              {app.name}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                  {installedScanning && (
                    <li className="px-3 py-2 text-center text-xs text-muted">
                      Cargando más…
                    </li>
                  )}
                </ul>
              )}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={btnGhost}
                onClick={onBackToAdd}
                disabled={busy}
              >
                Atrás
              </button>
              <span className="mr-auto text-xs text-muted">
                {pickedPaths.size
                  ? `${pickedPaths.size} elegidos`
                  : installedScanning
                    ? `${installed.length}…`
                    : `${filteredInstalled.length}`}
              </span>
              <button
                type="button"
                className={btnPrimary}
                disabled={busy || !pickedPaths.size}
                onClick={() => void onAddPicked()}
              >
                {busy ? "Añadiendo…" : "Añadir"}
              </button>
            </div>
          </>
        )}

        {mode === "url" && (
          <form onSubmit={onSubmitUrl}>
            <h3 className="m-0 font-display tracking-tight">Añadir enlace</h3>
            <Field label="Nombre">
              <input
                className={fieldInput}
                value={draftName}
                onChange={(e) => onDraftName(e.target.value)}
                placeholder="Opcional"
              />
            </Field>
            <Field label="URL">
              <input
                className={fieldInput}
                value={draftUrl}
                onChange={(e) => onDraftUrl(e.target.value)}
                placeholder="https://…"
                required
                autoFocus
              />
            </Field>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className={btnGhost} onClick={onBackToAdd}>
                Atrás
              </button>
              <button type="submit" className={btnPrimary}>
                Guardar
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
