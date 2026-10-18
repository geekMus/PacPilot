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

export async function getUpdateInfo(): Promise<UpdateInfo> {
  const now = Date.now();
  if (cachedInfo && now - cachedAt < (cachedInfo.checked ? CACHE_TTL_MS : FAILURE_CACHE_TTL_MS)) {
    return cachedInfo;
  }
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const response = await fetch(PROJECT_PACKAGE_JSON_URL, {
        headers: { "User-Agent": `genpac-runner/${APP_VERSION}`, Accept: "application/json" },
        signal: AbortSignal.timeout(4500),
      });
      if (!response.ok) throw new Error(`版本检查请求失败：HTTP ${response.status}`);

      const data = await response.json() as { version?: unknown };
      const latest = typeof data.version === "string" ? data.version : "";
      if (!parseCalendarVersion(latest)) throw new Error("远程 package.json 未提供有效日历版本");

      return makeInfo(latest, true);
    } catch {
      // 更新检查不可用时不影响主页与 PAC 服务，也不弹出错误提示。
      return makeInfo(null, false);
    } finally {
      inFlight = null;
    }
  })();

  const result = await inFlight;
  cachedInfo = result;
  cachedAt = Date.now();
  return result;
}
