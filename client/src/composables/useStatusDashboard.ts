import { useI18n } from "vue-i18n";
import { onMounted, ref, computed, watch } from "vue";
import { api, type Meta, type PacStatus } from "../api/client";

export function useStatusDashboard() {

import { useI18n } from "vue-i18n";
import { onMounted, ref, computed, watch } from "vue";
import { api, type Meta, type PacStatus } from "../api/client";
const { t, locale } = useI18n();

const status = ref<PacStatus | null>(null);
const meta = ref<Meta | null>(null);
const error = ref("");
const loading = ref(true);
const adminEntry = ref<"/admin/dashboard" | "/admin/settings" | "/admin/login">("/admin/dashboard");

async function loadStatus() {
  loading.value = true;
  error.value = "";
  try {
    const [currentStatus, currentMeta, currentSession] = await Promise.all([
      api.status(),
      api.meta(),
      api.session().catch(() => null),
    ]);
    status.value = currentStatus;
    meta.value = currentMeta;
    // 只有成功确认会话状态后才决定入口；未登录时直接进入登录页。
    if (currentSession && !currentSession.loggedIn) adminEntry.value = "/admin/login";
    else if (currentSession?.loggedIn) adminEntry.value = "/admin/dashboard";
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}
onMounted(() => {
  void loadStatus();
});

const hasRuleSummary = computed(
  () => status.value?.mode === "custom" || status.value?.mode === "remote"
);
const statusModeLabel = computed(() => (status.value ? t(`status.mode.${status.value.mode}`) : ""));
const statusNotice = computed(() => {
  const current = status.value;
  if (!current) return "";
  switch (current.mode) {
    case "empty":
      return t("status.notice.empty");
    case "custom":
      return t("status.notice.custom", {
        proxy: current.pacProxy || t("common.notRecognized"),
      });
    case "remote":
      return t("status.notice.remote", {
        block: current.blockList.length,
        direct: current.directList.length,
      });
    case "custom_parse_error":
      return t("status.notice.customParseError");
    case "other":
      return t("status.notice.other");
  }
});
const formattedUpdatedAt = computed(() => {
  const value = status.value?.updatedAt;
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(locale.value === "en_US" ? "en-US" : "zh-CN", {
    timeZone: status.value?.timeZone,
  });
});

const domainInput = ref("");
const checkedDomain = ref("");
const activeRuleType = ref<"direct" | "block">("direct");

interface RuleEntry {
  domain: string;
  source: string;
}
interface DomainRouteResult {
  kind: "direct" | "proxy" | "blocked" | "unknown" | "invalid";
  host: string;
  title: string;
  detail: string;
  matchedRule: string | null;
  source: string | null;
}

const directEntries = computed<RuleEntry[]>(() => {
  const current = status.value;
  if (!current) return [];
  const entries = new Map<string, RuleEntry>();
  for (const domain of current.remoteDirectList) {
    entries.set(domain.toLowerCase(), { domain, source: t("status.sourceRemoteExceptionDirect") });
  }
  for (const domain of current.directList) {
    entries.set(domain.toLowerCase(), { domain, source: t("status.sourceCustomDirect") });
  }
  return [...entries.values()];
});

const blockEntries = computed<RuleEntry[]>(() =>
  (status.value?.blockList ?? []).map((domain) => ({
    domain,
    source: t("status.sourceCustomBlock"),
  }))
);

watch(domainInput, () => {
  checkedDomain.value = "";
});

function checkDomain() {
  checkedDomain.value = domainInput.value.trim();
}

function isPrivateOrLoopbackIpv4(host: string): boolean {
  const parts = host.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return false;
  const octets = parts.map(Number);
  if (octets.some((part) => part < 0 || part > 255)) return false;
  const [a, b] = octets;
  return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function matchesCustomRule(host: string, rule: string): boolean {
  const normalizedHost = host.toLowerCase().replace(/\\.$/, "");
  const pattern = rule.trim().toLowerCase().replace(/\\.$/, "");
  if (!pattern) return false;

  // 必须与 server/services/pac-generator.ts 中的 isMatch 保持一致：
  // *.example.com 只匹配子域名；**.example.com 同时匹配根域名和子域名。
  if (pattern.startsWith("**.")) {
    const root = pattern.slice(3);
    return normalizedHost === root || normalizedHost.endsWith("." + root);
  }
  if (pattern.startsWith("*.")) {
    const suffix = pattern.slice(2);
    return normalizedHost.length > suffix.length + 1 && normalizedHost.endsWith("." + suffix);
  }
  if (pattern.includes("*")) return false;
  return normalizedHost === pattern;
}

function matchesRemoteDomain(host: string, rule: string): boolean {
  const domain = rule.toLowerCase().trim();
  return Boolean(domain) && (host === domain || host.endsWith("." + domain));
}

const domainRoute = computed<DomainRouteResult | null>(() => {
  const raw = checkedDomain.value;
  if (!raw) return null;

  let host: string;
  try {
    const address = /^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : "http://" + raw;
    host = new URL(address).hostname.toLowerCase().replace(/\.$/, "");
    if (!host || host.includes("*") || /\s/.test(host)) throw new Error("invalid host");
  } catch {
    return {
      kind: "invalid",
      host: raw,
      title: t("status.domainFormatInvalid"),
      detail: t("status.domainFormatDetail"),
      matchedRule: null,
      source: null,
    };
  }

  const current = status.value;
  if (!current || (current.mode !== "custom" && current.mode !== "remote")) {
    return {
      kind: "unknown",
      host,
      title: t("status.cannotJudge"),
      detail: current ? statusNotice.value : t("status.pacUnavailable"),
      matchedRule: null,
      source: null,
    };
  }

  if (host === "localhost" || !host.includes(".") || isPrivateOrLoopbackIpv4(host)) {
    return {
      kind: "direct",
      host,
      title: t("status.directTitle"),
      detail: t("status.directLocalDetail"),
      matchedRule: null,
      source: t("status.sourceLocal"),
    };
  }

  const blocked = current.blockList.find((rule) => matchesCustomRule(host, rule));
  if (blocked) {
    return {
      kind: "blocked",
      host,
      title: t("status.blockTitle"),
      detail: t("status.blockDetail"),
      matchedRule: blocked,
      source: t("status.sourceCustomBlock"),
    };
  }

  const customDirect = current.directList.find((rule) => matchesCustomRule(host, rule));
  if (customDirect) {
    return {
      kind: "direct",
      host,
      title: t("status.directTitle"),
      detail: t("status.directCustomDetail"),
      matchedRule: customDirect,
      source: t("status.sourceCustomDirect"),
    };
  }

  if (current.mode === "remote") {
    const remoteDirect = current.remoteDirectList.find((rule) => matchesRemoteDomain(host, rule));
    if (remoteDirect) {
      return {
        kind: "direct",
        host,
        title: t("status.directTitle"),
        detail: t("status.directRemoteExceptionDetail"),
        matchedRule: remoteDirect,
        source: t("status.sourceRemoteException"),
      };
    }

    const remoteProxy = current.remoteProxyList.find((rule) => matchesRemoteDomain(host, rule));
    if (remoteProxy) {
      return {
        kind: "proxy",
        host,
        title: t("common.viaProxy"),
        detail: t("status.proxyRemoteDetail"),
        matchedRule: remoteProxy,
        source: t("status.sourceRemoteProxy"),
      };
    }

    return {
      kind: "direct",
      host,
      title: t("status.directTitle"),
      detail: t("status.directRemoteDefaultDetail"),
      matchedRule: null,
      source: t("status.sourceRemoteDefault"),
    };
  }

  return {
    kind: "proxy",
    host,
    title: t("common.viaProxy"),
    detail: t("status.proxyDefaultDetail", {
      proxy: current.pacProxy || t("common.notRecognized"),
    }),
    matchedRule: null,
    source: current.pacProxy || t("status.sourceDefaultProxy"),
  };
});

  return {
    t,
    locale,
    status,
    meta,
    error,
    loading,
    adminEntry,
    loadStatus,
    hasRuleSummary,
    statusModeLabel,
    statusNotice,
    formattedUpdatedAt,
    domainInput,
    checkedDomain,
    activeRuleType,
    directEntries,
    blockEntries,
    checkDomain,
    domainRoute,
  };

}
