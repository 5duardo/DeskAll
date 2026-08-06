/** Default GitHub repo for release checks (owner/name). Editable in Ajustes. */
export const DEFAULT_GITHUB_REPO = "eduar/DeskAll";

export interface GithubRelease {
  tagName: string;
  name: string;
  htmlUrl: string;
  publishedAt: string;
  body: string;
  prerelease: boolean;
}

export type UpdateCheckResult =
  | { status: "upToDate"; current: string; latest: string; release: GithubRelease }
  | { status: "available"; current: string; latest: string; release: GithubRelease }
  | { status: "error"; message: string };

function normalizeVersion(v: string): number[] {
  return v
    .trim()
    .replace(/^v/i, "")
    .split(/[.+-]/)
    .map((p) => parseInt(p.replace(/\D/g, ""), 10))
    .map((n) => (Number.isFinite(n) ? n : 0));
}

/** Returns true if `a` is greater than `b` (semver-ish). */
export function isNewerVersion(a: string, b: string): boolean {
  const aa = normalizeVersion(a);
  const bb = normalizeVersion(b);
  const len = Math.max(aa.length, bb.length);
  for (let i = 0; i < len; i++) {
    const x = aa[i] ?? 0;
    const y = bb[i] ?? 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}

export async function fetchLatestRelease(
  repo: string,
): Promise<GithubRelease> {
  const clean = repo.trim().replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$/, "");
  if (!/^[\w.-]+\/[\w.-]+$/.test(clean)) {
    throw new Error("Repositorio inválido. Usa el formato owner/repo");
  }

  const res = await fetch(
    `https://api.github.com/repos/${clean}/releases/latest`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );

  if (res.status === 404) {
    throw new Error("No hay releases en ese repositorio (o no existe)");
  }
  if (!res.ok) {
    throw new Error(`GitHub respondió ${res.status}`);
  }

  const data = (await res.json()) as {
    tag_name: string;
    name: string | null;
    html_url: string;
    published_at: string;
    body: string | null;
    prerelease: boolean;
  };

  return {
    tagName: data.tag_name,
    name: data.name || data.tag_name,
    htmlUrl: data.html_url,
    publishedAt: data.published_at,
    body: data.body ?? "",
    prerelease: data.prerelease,
  };
}

export async function checkForUpdates(
  currentVersion: string,
  repo: string,
): Promise<UpdateCheckResult> {
  try {
    const release = await fetchLatestRelease(repo);
    const latest = release.tagName;
    if (isNewerVersion(latest, currentVersion)) {
      return { status: "available", current: currentVersion, latest, release };
    }
    return { status: "upToDate", current: currentVersion, latest, release };
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
