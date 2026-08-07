import { useCallback, useEffect, useState } from "react";
import {
  Cpu,
  HardDrive,
  LoaderCircle,
  MemoryStick,
  Monitor,
  RefreshCw,
  Server,
} from "./icons";
import type { SystemInfo } from "../types";
import { getSystemInfo } from "../lib/tauri";
import { btnGhost } from "../lib/ui";

const REFRESH_MS = 2500;

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  const digits = i === 0 ? 0 : n >= 100 ? 0 : n >= 10 ? 1 : 2;
  return `${n.toFixed(digits)} ${units[i]}`;
}

function formatUptime(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0) parts.push(`${hours}h`);
  parts.push(`${mins}m`);
  return parts.join(" ");
}

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

function UsageBar({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail?: string;
}) {
  const pct = clampPct(value);
  const hot = pct >= 90;
  const warm = pct >= 70;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium text-ink">{label}</span>
        <span className="tabular-nums text-muted">
          {detail ?? `${pct.toFixed(0)}%`}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-paper">
        <div
          className={[
            "h-full rounded-full transition-[width] duration-500 ease-out",
            hot ? "bg-danger" : warm ? "bg-accent" : "bg-accent-deep",
          ].join(" ")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-line bg-paper/50 px-3 py-2.5">
      <span className="shrink-0 text-sm text-muted">{label}</span>
      <span className="min-w-0 text-right text-sm font-medium break-words text-ink">
        {value}
      </span>
    </div>
  );
}

export function PcInfoView() {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    else setRefreshing(true);
    try {
      const next = await getSystemInfo();
      setInfo(next);
      setError(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
    const id = window.setInterval(() => void load(true), REFRESH_MS);
    return () => window.clearInterval(id);
  }, [load]);

  const memPct = info
    ? (info.memory.usedBytes / Math.max(1, info.memory.totalBytes)) * 100
    : 0;

  return (
    <section className="relative flex h-full flex-col gap-5 overflow-auto pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="m-0 font-display text-2xl tracking-tight">PC</h1>
          <p className="mt-1 text-sm text-muted">
            Hardware, sistema y uso en tiempo real.
          </p>
        </div>
        <button
          type="button"
          className={btnGhost}
          disabled={loading || refreshing}
          onClick={() => void load(true)}
        >
          {refreshing ? (
            <LoaderCircle className="size-4 animate-spin" strokeWidth={1.8} />
          ) : (
            <RefreshCw className="size-4" strokeWidth={1.8} />
          )}
          Actualizar
        </button>
      </header>

      {loading && !info ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-muted">
          <LoaderCircle className="size-8 animate-spin text-accent" strokeWidth={1.8} />
          <p className="m-0 text-sm">Leyendo información del sistema…</p>
        </div>
      ) : error && !info ? (
        <div className="rounded-[18px] border border-danger/30 bg-danger/10 p-5 text-sm text-danger">
          No se pudo leer la info del PC: {error}
        </div>
      ) : info ? (
        <>
          <div className="rounded-[18px] border border-line bg-surface p-5 shadow-desk">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="m-0 font-display text-lg tracking-tight">Sistema</h2>
                <p className="mt-1 text-sm text-muted">Identidad del equipo</p>
              </div>
              <Monitor className="size-5 shrink-0 text-accent" strokeWidth={1.8} />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <InfoRow label="Nombre" value={info.hostname} />
              <InfoRow
                label="Sistema"
                value={`${info.osName} ${info.osVersion}`.trim()}
              />
              <InfoRow label="Kernel" value={info.kernelVersion} />
              <InfoRow label="Arquitectura" value={info.arch} />
              <InfoRow label="Encendido" value={formatUptime(info.uptimeSecs)} />
              <InfoRow
                label="Arranque"
                value={new Date(info.bootTimeSecs * 1000).toLocaleString()}
              />
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <div className="rounded-[18px] border border-line bg-surface p-5 shadow-desk">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h2 className="m-0 font-display text-lg tracking-tight">
                    Procesador
                  </h2>
                  <p className="mt-1 text-sm text-muted">CPU</p>
                </div>
                <Cpu className="size-5 shrink-0 text-accent" strokeWidth={1.8} />
              </div>
              <p className="mt-0 mb-4 text-sm leading-snug font-medium text-ink">
                {info.cpu.brand}
              </p>
              <div className="mb-4 grid gap-2">
                <InfoRow
                  label="Núcleos"
                  value={
                    info.cpu.physicalCores
                      ? `${info.cpu.physicalCores} físicos · ${info.cpu.logicalCores} lógicos`
                      : `${info.cpu.logicalCores} lógicos`
                  }
                />
                {info.cpu.frequencyMhz > 0 && (
                  <InfoRow
                    label="Frecuencia"
                    value={`${(info.cpu.frequencyMhz / 1000).toFixed(2)} GHz`}
                  />
                )}
              </div>
              <UsageBar label="Uso" value={info.cpu.usage} />
            </div>

            <div className="rounded-[18px] border border-line bg-surface p-5 shadow-desk">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h2 className="m-0 font-display text-lg tracking-tight">
                    Memoria
                  </h2>
                  <p className="mt-1 text-sm text-muted">RAM</p>
                </div>
                <MemoryStick
                  className="size-5 shrink-0 text-accent"
                  strokeWidth={1.8}
                />
              </div>
              <div className="mb-4 grid gap-2">
                <InfoRow
                  label="Total"
                  value={formatBytes(info.memory.totalBytes)}
                />
                <InfoRow
                  label="En uso"
                  value={formatBytes(info.memory.usedBytes)}
                />
                <InfoRow
                  label="Disponible"
                  value={formatBytes(info.memory.availableBytes)}
                />
                {info.memory.swapTotalBytes > 0 && (
                  <InfoRow
                    label="Swap"
                    value={`${formatBytes(info.memory.swapUsedBytes)} / ${formatBytes(info.memory.swapTotalBytes)}`}
                  />
                )}
              </div>
              <UsageBar
                label="Uso"
                value={memPct}
                detail={`${formatBytes(info.memory.usedBytes)} / ${formatBytes(info.memory.totalBytes)} · ${memPct.toFixed(0)}%`}
              />
            </div>
          </div>

          <div className="rounded-[18px] border border-line bg-surface p-5 shadow-desk">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="m-0 font-display text-lg tracking-tight">
                  Almacenamiento
                </h2>
                <p className="mt-1 text-sm text-muted">Discos y unidades</p>
              </div>
              <HardDrive className="size-5 shrink-0 text-accent" strokeWidth={1.8} />
            </div>
            {info.disks.length === 0 ? (
              <p className="m-0 text-sm text-muted">No se detectaron discos.</p>
            ) : (
              <div className="grid gap-4">
                {info.disks.map((disk) => {
                  const used = disk.totalBytes - disk.availableBytes;
                  const pct = (used / Math.max(1, disk.totalBytes)) * 100;
                  return (
                    <div
                      key={`${disk.mountPoint}-${disk.name}`}
                      className="rounded-2xl border border-line bg-paper/50 p-4"
                    >
                      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="m-0 flex items-center gap-2 font-semibold text-ink">
                            <Server className="size-4 shrink-0 text-accent" strokeWidth={1.8} />
                            <span className="truncate">
                              {disk.name || disk.mountPoint}
                            </span>
                          </p>
                          <p className="mt-1 m-0 text-xs text-muted">
                            {disk.mountPoint}
                            {disk.fileSystem ? ` · ${disk.fileSystem}` : ""}
                            {disk.isRemovable ? " · extraíble" : ""}
                          </p>
                        </div>
                        <span className="text-xs tabular-nums text-muted">
                          {formatBytes(disk.availableBytes)} libres
                        </span>
                      </div>
                      <UsageBar
                        label="Ocupado"
                        value={pct}
                        detail={`${formatBytes(used)} / ${formatBytes(disk.totalBytes)} · ${pct.toFixed(0)}%`}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}
