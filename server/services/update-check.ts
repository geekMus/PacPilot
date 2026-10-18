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
    const sources = [
      PROJECT_PACKAGE_JSON_URL,
      "https://cdn.jsdelivr.net/gh/geekMus/genpac-runner@main/package.json",
      "https://api.github.com/repos/geekMus/genpac-runner/contents/package.json",
    ];

    for (const url of sources) {
      try {
        const response = await fetch(url, {
          headers: {
            "User-Agent": `genpac-runner/${APP_VERSION}`,
            Accept: url.includes("api.github.com")
              ? "application/vnd.github+json"
              : "application/json",
          },
          signal: AbortSignal.timeout(7000),
        });
        if (!response.ok) continue;

        let latest = "";
        if (url.includes("api.github.com")) {
          const data = await response.json() as { content?: unknown; encoding?: unknown };
          if (typeof data.content === "string" && data.encoding === "base64") {
            const decoded = Buffer.from(data.content.replace(/\s/g, ""), "base64").toString("utf8");
            const packageData = JSON.parse(decoded) as { version?: unknown };
            latest = typeof packageData.version === "string" ? packageData.version : "";
          }
        } else {
          const data = await response.json() as { version?: unknown };
          latest = typeof data.version === "string" ? data.version : "";
        }

        if (parseCalendarVersion(latest)) return makeInfo(latest, true);
      } catch {
        // 尝试下一个独立来源；所有来源都失败时再返回未知状态。
      }
    }

    // 更新检查不可用时不影响主页与 PAC 服务，也不弹出错误提示。
    return makeInfo(null, false);
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
