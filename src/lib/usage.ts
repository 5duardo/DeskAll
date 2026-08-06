/** Format milliseconds as compact human usage time. */
export function formatUsage(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  if (totalSec < 60) return `${totalSec}s`;
  const mins = Math.floor(totalSec / 60);
  if (mins < 60) {
    const s = totalSec % 60;
    return s > 0 ? `${mins}m ${s}s` : `${mins}m`;
  }
  const hours = Math.floor(mins / 60);
  const m = mins % 60;
  if (hours < 24) {
    return m > 0 ? `${hours}h ${m}m` : `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  const h = hours % 24;
  return h > 0 ? `${days}d ${h}h` : `${days}d`;
}

export function liveUsageMs(
  baseMs: number,
  sessionStartedAt: number | null,
  now = Date.now(),
): number {
  if (!sessionStartedAt) return baseMs;
  return baseMs + Math.max(0, now - sessionStartedAt);
}
