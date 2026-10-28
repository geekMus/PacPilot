import { createHash } from "node:crypto";
import type { ApplicationStorage } from "../storage/repositories";
import type { AppSettings } from "../../shared/contracts";
import { t } from "../../shared/i18n";
import type { AppLocale } from "../../shared/i18n/locale";
import { buildRemoteListPac } from "./remote-list";

/**
 * Persistent snapshot of the fetched remote rule list.
 *
 * The PAC body is rendered from this snapshot instead of re-downloading on
 * every request, so changing render parameters (proxy string, compression,
 * custom lists) never requires touching the network.
 */
export interface PacRuleSource {
  fetchedAt: string;
  url: string;
  format: "gfwlist-base64" | "abp" | "plain-domains";
  proxyHosts: string[];
  directHosts: string[];
  fetchMeta?: {
    status: number;
    duration_ms: number;
    response_bytes: number;
    attempts: number;
  };
}

const RULE_SOURCE_KEY = "pac.rule-source.json";

export async function readRuleSource(
  storage: Pick<ApplicationStorage, "artifacts">
): Promise<PacRuleSource | null> {
  try {
    const bytes = await storage.artifacts.read(RULE_SOURCE_KEY);
    if (!bytes) return null;
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as PacRuleSource;
    if (!Array.isArray(parsed.proxyHosts) || !Array.isArray(parsed.directHosts)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function writeRuleSource(
  storage: Pick<ApplicationStorage, "artifacts">,
  source: PacRuleSource
): Promise<void> {
  await storage.artifacts.write(RULE_SOURCE_KEY, JSON.stringify(source));
}

export async function clearRuleSource(
  storage: Pick<ApplicationStorage, "artifacts">
): Promise<void> {
  try {
    await storage.artifacts.delete(RULE_SOURCE_KEY);
  } catch {
    /* artifact may not exist */
  }
}

/**
 * Rendered PAC body kept in process memory.
 *
 * `sourceVersion` fingerprints the inputs (settings + rule snapshot) so a cache
 * entry can be validated cheaply, and `etag` is derived from the body bytes so
 * clients keep their cached copy across restarts as long as the content is
 * unchanged.
 */
export interface RenderedPac {
  body: string;
  /** Uncompressed PAC used by the status page parser. */
  source: string;
  etag: string;
  builtAt: string;
  sourceVersion: string;
  stale: boolean;
  /** Whether `body` is terser-minified; surfaced as the X-Pac-Compressed header. */
  compressed: boolean;
  /** Whether `body` went through the obfuscator; surfaced as the X-Pac-Obfuscated header. */
  obfuscated: boolean;
}

let rendered: RenderedPac | null = null;
let inFlight: Promise<RenderedPac> | null = null;

export function invalidateRenderedPac(): void {
  rendered = null;
}

export function getRenderedPac(): RenderedPac | null {
  return rendered;
}

export function setRenderedPac(value: RenderedPac): void {
  rendered = value;
}

/** Collapse concurrent rebuilds into a single execution. */
export async function withPacBuildLock<T>(build: () => Promise<T>): Promise<T> {
  if (inFlight) return inFlight as unknown as Promise<T>;
  const task = build();
  inFlight = task as unknown as Promise<RenderedPac>;
  try {
    return await task;
  } finally {
    inFlight = null;
  }
}

/** Stable fingerprint of everything that influences the rendered PAC. */
export function computeSourceVersion(settings: AppSettings, source: PacRuleSource | null): string {
  const material = JSON.stringify({
    mode: settings.mode,
    pacProxy: settings.pacProxy,
    pacCompress: settings.pacCompress,
    pacObfuscate: settings.pacObfuscate,
    // 时区只影响头部生成时间的格式，但头部同样属于输出字节，必须计入指纹，
    // 否则改时区后命中旧缓存会保留旧的时区时间。
    timezone: settings.timezone,
    blockList: settings.blockList,
    directList: settings.directList,
    listUrl: settings.listUrl,
    fetchedAt: source?.fetchedAt ?? "",
    // 主机列表内容本身影响输出字节，必须计入指纹；排序保证同内容不同顺序不会触发重建。
    proxyHosts: [...(source?.proxyHosts ?? [])].sort(),
    directHosts: [...(source?.directHosts ?? [])].sort(),
  });
  return createHash("sha256").update(material).digest("hex").slice(0, 32);
}

export function computeEtag(body: string): string {
  return '"' + createHash("sha256").update(body).digest("base64url").slice(0, 27) + '"';
}

/** Build the uncompressed PAC for the current settings. */
export function renderPacSource(
  settings: AppSettings,
  source: PacRuleSource | null,
  customBuilder: (settings: AppSettings) => string,
  locale: AppLocale = "zh_CN"
): string {
  if (settings.mode === "remote") {
    if (!source) {
      throw new Error(t(locale, "remoteList.noSnapshot"));
    }
    return buildRemoteListPac(
      settings.pacProxy,
      source.proxyHosts,
      source.directHosts,
      settings.blockList,
      settings.directList,
      false
    );
  }
  return customBuilder(settings);
}

/** Freshness of the rendered entry relative to the current inputs. */
export function isRenderFresh(settings: AppSettings, source: PacRuleSource | null): boolean {
  return rendered !== null && rendered.sourceVersion === computeSourceVersion(settings, source);
}
