import { APP_VERSION, PROJECT_PACKAGE_JSON_URL, PROJECT_URL } from "../version";

export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  checked: boolean;
  repositoryUrl: string;
}

interface CalendarVersion {
  date: string;
  revision: number;
}

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const FAILURE_CACHE_TTL_MS = 5 * 60 * 1000;

let cachedAt = 0;
let cachedInfo: UpdateInfo | null = null;
let inFlight: Promise<UpdateInfo> | null = null;

function parseCalendarVersion(value: string): CalendarVersion | null {
  const match = /^(\d{4})\.(\d{2})\.(\d{2})(?:-r([1-9]\d*))?$/.exec(value);
  if (!match) return null;

  const [, year, month, day, revisionText] = match;
  const date = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== `${year}-${month}-${day}`
  ) {
    return null;
  }

  return { date: `${year}.${month}.${day}`, revision: revisionText ? Number(revisionText) : 0 };
}

function isNewerVersion(candidate: string, current: string): boolean {
  const next = parseCalendarVersion(candidate);
  const installed = parseCalendarVersion(current);
  if (!next || !installed) return false;
  if (next.date !== installed.date) return next.date > installed.date;
  return next.revision > installed.revision;
}

function makeInfo(latestVersion: string | null, checked: boolean): UpdateInfo {
  return {
    currentVersion: APP_VERSION,
    latestVersion,
    updateAvailable: Boolean(latestVersion && isNewerVersion(latestVersion, APP_VERSION)),
    checked,
    repositoryUrl: PROJECT_URL,
  };
}

export async function getUpdateInfo(forceRefresh = false): Promise<UpdateInfo> {
  const now = Date.now();
  if (!forceRefresh && cachedInfo && now - cachedAt < (cachedInfo.checked ? CACHE_TTL_MS : FAILURE_CACHE_TTL_MS)) {
    return cachedInfo;
  }
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      // 每次真正请求远端时都使用唯一查询参数，降低 GitHub Raw 或中间代理/CDN 返回旧缓存的概率。
      // 同时要求 HTTP 缓存重新验证；即使上游不遵守这些指令，唯一 URL 仍可避免复用同一缓存键。
      const sourceUrl = new URL(PROJECT_PACKAGE_JSON_URL);
      sourceUrl.searchParams.set("_cacheBust", `${Date.now()}-${crypto.randomUUID()}`);

      const response = await fetch(sourceUrl, {
        cache: "no-store",
        headers: {
          "User-Agent": `genpac-runner/${APP_VERSION}`,
          Accept: "application/json",
          "Cache-Control": "no-cache, no-store, max-age=0",
          Pragma: "no-cache",
        },
        signal: AbortSignal.timeout(7000),
      });
      if (!response.ok) throw new Error(`Version request failed: ${response.status}`);

      const data = await response.json() as { version?: unknown };
      const latest = typeof data.version === "string" ? data.version : "";
      if (!parseCalendarVersion(latest)) throw new Error("Invalid version in package.json");

      return makeInfo(latest, true);
    } catch {
      // 版本检查失败不影响主页与 PAC 服务。
      return makeInfo(null, false);
    }
  })();

  const request = inFlight;
  try {
    const result = await request;
    cachedInfo = result;
    cachedAt = Date.now();
    return result;
  } finally {
    if (inFlight === request) inFlight = null;
  }
}
