<script setup lang="ts">
import { onMounted, reactive, ref, computed, nextTick, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter, useRoute } from "vue-router";
import {
  api,
  type AppSettings,
  type GenerationLog,
  type GenpacProbe,
  type WebhookConfig,
} from "../api/client";

import AdminLayout from "../components/AdminLayout.vue";
import AppIcon from "../components/AppIcon.vue";
import AppFooter from "../components/AppFooter.vue";
import DomainListEditor from "../components/DomainListEditor.vue";
import { analyzeDomainRules } from "../utils/domain-rules";
import WebhookChannelEditor from "../components/WebhookChannelEditor.vue";
import TextDetail from "../components/TextDetail.vue";
import VirtualTable from "../components/VirtualTable.vue";
import { useToast } from "../composables/useToast";
import cronstrue from "cronstrue";
import { CronExpressionParser } from "cron-parser";
import "cronstrue/locales/zh_CN";

const { t, locale } = useI18n();
const localizedText = (
  text: string | null | undefined,
  key: string | undefined,
  params?: Record<string, string | number>
) => (key ? t(key, params ?? {}) : text ?? "");
const { notify } = useToast();
const router = useRouter();
const route = useRoute();
const loading = ref(true);
const saving = ref(false);
const savedSettingsSnapshot = ref("");
const flash = ref("");
const flashOk = ref(true);
function showFlash(message: string, success = true) {
  flash.value = message;
  flashOk.value = success;
}
const error = ref("");
const logs = ref<GenerationLog[]>([]);
const logPageSize = 50;
const logHasMore = ref(false);
const logLoadingMore = ref(false);
const logLoadError = ref("");
const logTotal = ref(0);

async function loadMoreLogs(): Promise<void> {
  if (logLoadingMore.value || !logHasMore.value || !logs.value.length) return;
  logLoadingMore.value = true;
  logLoadError.value = "";
  try {
    const cursor = logs.value[logs.value.length - 1]?.id ?? 0;
    const page = await api.logsPage(logPageSize, cursor);
    const seen = new Set(logs.value.map((item) => item.id));
    logs.value.push(...page.items.filter((item) => !seen.has(item.id)));
    logHasMore.value = page.hasMore;
    logTotal.value = page.total;
  } catch (caught) {
    logLoadError.value = caught instanceof Error ? caught.message : String(caught);
  } finally {
    logLoadingMore.value = false;
  }
}

async function refreshLogs(): Promise<void> {
  const page = await api.logsPage(logPageSize, 0);
  logs.value = page.items;
  logHasMore.value = page.hasMore;
  logTotal.value = page.total;
  logLoadError.value = "";
}
const genpacProbe = ref<GenpacProbe | null>(null);
const securityStatus = ref({ isDefaultPassword: false, mustChangePassword: false });
const timezoneMenuOpen = ref(false);
const timezoneQuery = ref("");
const mobileTimezoneOpen = ref(false);
const passwordSaving = ref(false);
const passwordForm = reactive({ currentPassword: "", newPassword: "", confirmPassword: "" });
const webhookTestState = reactive({
  success: { pending: false, ok: null as boolean | null, message: "" },
  failure: { pending: false, ok: null as boolean | null, message: "" },
});

const form = reactive({
  mode: "custom" as "custom" | "remote",
  pacProxy: "",
  pacCompress: true,
  listUrl: "",
  directListText: "",
  blockListText: "",
  cronSchedule: "",
  timezone: "Asia/Shanghai",
  locale: "zh_CN" as "zh_CN" | "en_US",
  proxyTestUrl: "https://www.google.com/generate_204",
  logRetentionDays: 30,
  webhookSuccessUrl: "",
  webhookSuccessBody: "",
  webhookFailureUrl: "",
  webhookFailureBody: "",
  webhookSuccessConfig: defaultWebhookConfig(),
  webhookFailureConfig: defaultWebhookConfig(),
});

function defaultWebhookConfig(): WebhookConfig {
  return {
    provider: "custom",
    url: "",
    method: "POST",
    headers: "{}",
    body: "",
    dingTalkSecret: "",
    dingTalkMessageType: "text",
    testBody: JSON.stringify(
      { ok: "{{ok}}", event: "{{event}}", message: "{{message}}", timestamp: "{{timestamp}}" },
      null,
      2
    ),
    messageTemplate:
      t("settings.defaultMessageTemplate"),
    testMessageTemplate: t("settings.testMessageTemplate"),
  };
}
function normalizedWebhookConfig(
  value: WebhookConfig | undefined,
  legacyUrl: string,
  legacyBody: string
): WebhookConfig {
  return {
    ...defaultWebhookConfig(),
    ...value,
    url: value?.url ?? legacyUrl,
    body: value?.body ?? legacyBody,
    testBody: value?.testBody ?? defaultWebhookConfig().testBody,
    messageTemplate: value?.messageTemplate?.trim()
      ? value.messageTemplate
      : defaultWebhookConfig().messageTemplate,
    testMessageTemplate: value?.testMessageTemplate?.trim()
      ? value.testMessageTemplate
      : defaultWebhookConfig().testMessageTemplate,
  };
}

const commonTimeZones = [
  { value: "Asia/Shanghai", labelKey: "settings.tzShanghai" },
  { value: "Asia/Taipei", labelKey: "settings.tzTaipei" },
  { value: "Asia/Hong_Kong", labelKey: "settings.tzHongKong" },
  { value: "Asia/Tokyo", labelKey: "settings.tzTokyo" },
  { value: "Asia/Seoul", labelKey: "settings.tzSeoul" },
  { value: "Asia/Singapore", labelKey: "settings.tzSingapore" },
  { value: "Asia/Bangkok", labelKey: "settings.tzBangkok" },
  { value: "Asia/Kolkata", labelKey: "settings.tzKolkata" },
  { value: "Asia/Dubai", labelKey: "settings.tzDubai" },
  { value: "Europe/London", labelKey: "settings.tzLondon" },
  { value: "Europe/Paris", labelKey: "settings.tzParis" },
  { value: "Europe/Berlin", labelKey: "settings.tzBerlin" },
  { value: "America/New_York", labelKey: "settings.tzNewYork" },
  { value: "America/Chicago", labelKey: "settings.tzChicago" },
  { value: "America/Denver", labelKey: "settings.tzDenver" },
  { value: "America/Los_Angeles", labelKey: "settings.tzLosAngeles" },
  { value: "America/Toronto", labelKey: "settings.tzToronto" },
  { value: "Australia/Sydney", labelKey: "settings.tzSydney" },
  { value: "Pacific/Auckland", labelKey: "settings.tzAuckland" },
  { value: "Etc/UTC", labelKey: "settings.tzUTC" },
] as const;

function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value.trim() }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

const filteredTimeZones = computed(() => {
  const query = timezoneQuery.value.trim().toLowerCase();
  if (!query) return commonTimeZones;
  return commonTimeZones.filter(
    (zone) =>
      zone.value.toLowerCase().includes(query) ||
      String(t(zone.labelKey)).toLowerCase().includes(query)
  );
});
function selectTimeZone(value: string) {
  form.timezone = value;
  timezoneQuery.value = value;
  timezoneMenuOpen.value = false;
  mobileTimezoneOpen.value = false;
}
function closeTimezoneMenu() {
  window.setTimeout(() => {
    timezoneMenuOpen.value = false;
  }, 140);
}
function openMobileTimezonePicker() {
  timezoneQuery.value = "";
  mobileTimezoneOpen.value = true;
}

async function scrollToCurrentSection(): Promise<void> {
  await nextTick();
  const hash = route.hash;
  if (!hash || !/^#[a-z-]+$/.test(hash)) return;
  document.querySelector(hash)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

watch(
  () => route.hash,
  (hash) => {
    if (hash) void scrollToCurrentSection();
  }
);

const modeHint = computed(() =>
  form.mode === "custom"
    ? t("settings.modeCustomHint")
    : t("settings.modeRemoteHint")
);

const cronPresets = [
  { labelKey: "settings.cronOff", value: "", hintKey: "settings.cronOffHint" },
  { labelKey: "settings.cronHourly", value: "0 * * * *", hintKey: "settings.cronHourlyHint" },
  { labelKey: "settings.cron3h", value: "0 */3 * * *", hintKey: "settings.cron3hHint" },
  { labelKey: "settings.cronDaily0", value: "0 0 * * *", hintKey: "settings.cronDaily0Hint" },
  { labelKey: "settings.cronDaily6", value: "0 6 * * *", hintKey: "settings.cronDaily6Hint" },
  { labelKey: "settings.cronWeekly", value: "0 0 * * 1", hintKey: "settings.cronWeeklyHint" },
] as const;

function parseCronDescription(expr: string): { description: string; error: string } {
  const value = expr.trim();
  if (!value) return { description: "", error: "" };
  if (value.split(/\s+/).length !== 5) {
    return { description: "", error: t("settings.cronFormatError") };
  }
  try {
    CronExpressionParser.parse(value);
    return {
      description: cronstrue.toString(value, {
        locale: locale.value === "en_US" ? "en" : "zh_CN",
        dayOfWeekStartIndexZero: false,
        use24HourTimeFormat: true,
        throwExceptionOnParseError: true,
      }),
      error: "",
    };
  } catch {
    return { description: "", error: t("settings.cronParseError") };
  }
}

const cronParse = computed(() => parseCronDescription(form.cronSchedule));
const cronHint = computed(() => {
  if (!form.cronSchedule.trim()) return t("settings.cronDisabledMsg");
  if (cronParse.value.error) return t("settings.cronInvalidMsg", { error: cronParse.value.error });
  return t("settings.cronPlanMsg", { description: cronParse.value.description, timezone: form.timezone });
});

function applyCronPreset(value: string) {
  form.cronSchedule = value;
}

function jsonBodyError(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  try {
    const value: unknown = JSON.parse(s);
    if (value === null || typeof value !== "object") return t("settings.jsonTopLevel");
    return "";
  } catch {
    return t("settings.jsonFormatError");
  }
}

type WebhookFieldErrors = {
  url: string;
  headers: string;
  body: string;
  testBody: string;
  secret: string;
};

function validateWebhookDraft(config: WebhookConfig, label: string): WebhookFieldErrors {
  const errors: WebhookFieldErrors = { url: "", headers: "", body: "", testBody: "", secret: "" };
  if (config.provider === "custom") {
    const url = config.url.trim();
    const rawHeaders = config.headers.trim();
    const hasCustomRequest = Boolean(
      url || config.body.trim() || (rawHeaders && rawHeaders !== "{}")
    );
    if (url && !looksLikeUrl(url)) errors.url = t("settings.webhookNeedUrl", { label });
    else if (!url && hasCustomRequest)
      errors.url = t("settings.webhookNeedUrlForBody", { label });
    const bodyError = jsonBodyError(config.body);
    if (bodyError) errors.body = t("settings.webhookBodyError", { label, error: bodyError });
    const testBodyError = jsonBodyError(config.testBody);
    if (testBodyError) errors.testBody = t("settings.webhookTestBodyError", { label, error: testBodyError });
    if (rawHeaders) {
      try {
        const headers: unknown = JSON.parse(rawHeaders);
        if (!headers || typeof headers !== "object" || Array.isArray(headers))
          errors.headers = t("settings.webhookHeadersError", { label });
        else {
          for (const [name, value] of Object.entries(headers as Record<string, unknown>)) {
            if (!name.trim() || typeof value !== "string") {
              errors.headers = t("settings.headersMustStrings", { label });
              break;
            }
            if (
              /^(host|content-length|connection|transfer-encoding|content-type)$/i.test(name) ||
              /[\r\n]/.test(value)
            ) {
              errors.headers =
                label +
                t("settings.headersTransport");
              break;
            }
          }
        }
      } catch {
        errors.headers = t("settings.headersJsonError", { label });
      }
    }
  } else if (config.provider === "dingtalk") {
    if (config.url.trim()) {
      if (!looksLikeUrl(config.url.trim()))
        errors.url = t("settings.dingTalkUrl", { label });
      else if (!new URL(config.url.trim()).searchParams.has("access_token"))
        errors.url = t("settings.dingTalkToken", { label });
      if (!config.dingTalkSecret.trim())
        errors.secret = t("settings.dingTalkSecret", { label });
    } else if (config.dingTalkSecret.trim())
      errors.url = t("settings.dingTalkSecretNeedsUrl", { label });
  }
  return errors;
}

function webhookErrorMessages(errors: WebhookFieldErrors): string[] {
  return [errors.url, errors.headers, errors.body, errors.testBody, errors.secret].filter(Boolean);
}

function validDomainOrIPv4(host: string): boolean {
  if (!host || host.length > 253) return false;
  const ipv4Like = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host);
  if (ipv4Like) {
    return host.split(".").every((part) => /^(0|[1-9]\d{0,2})$/.test(part) && Number(part) <= 255);
  }
  const labelPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
  return host
    .replace(/\.$/, "")
    .split(".")
    .every((part) => labelPattern.test(part));
}

function validatePacProxyString(rawValue: string): string | null {
  const raw = rawValue.trim();
  if (!raw) return t("settings.pacProxyRequired");
  const entries = raw.split(";").map((entry) => entry.trim());
  while (entries.length > 0 && entries[entries.length - 1] === "") entries.pop();
  if (entries.length === 0 || entries.some((entry) => !entry)) {
    return t("settings.proxySemicolon");
  }
  for (const [index, entry] of entries.entries()) {
    if (/^DIRECT$/i.test(entry)) continue;
    const match = entry.match(/^(PROXY|HTTP|HTTPS|SOCKS|SOCKS4|SOCKS5)\s+(\S+)$/i);
    if (!match) {
      return t("settings.proxyItemInvalid", { n: index + 1, item: entry.slice(0, 80) });
    }
    const endpointMatch = match[2].match(/^(?:\[([^\]]+)\]|([^:\[\]\s]+)):(\d{1,5})$/);
    if (!endpointMatch) {
      return t("settings.proxyHostInvalid", { n: index + 1 });
    }
    const host = endpointMatch[1] ?? endpointMatch[2] ?? "";
    const port = Number(endpointMatch[3]);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      return t("settings.proxyPortInvalid", { n: index + 1 });
    }
    if (endpointMatch[1]) {
      try {
        new URL("http://[" + host + "]:" + port + "/");
      } catch {
        return t("settings.proxyIpv6Invalid", { n: index + 1 });
      }
    } else if (!validDomainOrIPv4(host)) {
      return t("settings.proxyHostnameInvalid", { n: index + 1 });
    }
  }
  return null;
}

function validateDomainRules(rawValue: string, label: string): string | null {
  const analysis = analyzeDomainRules(
    label === t("settings.directList") ? rawValue : "",
    label === t("settings.blockList") ? rawValue : ""
  );
  const firstError = [...analysis.direct.diagnostics, ...analysis.block.diagnostics].find(
    (item) => item.severity === "error"
  );
  return firstError ? t("settings.domainLineError", { label, line: firstError.line, message: firstError.message }) : null;
}

function validateProxyTestUrl(rawValue: string): string | null {
  const value = rawValue.trim();
  if (!value) return t("settings.probeUrlEmpty");
  if (/[\u0000-\u0020\u007f]/.test(value))
    return t("settings.probeUrlWhitespace");
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password || url.hash) {
      return t("settings.probeUrlHttps");
    }
    return null;
  } catch {
    return t("settings.probeUrlInvalid");
  }
}

function looksLikeUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return (
      (u.protocol === "http:" || u.protocol === "https:") &&
      Boolean(u.hostname) &&
      !u.username &&
      !u.password
    );
  } catch {
    return false;
  }
}

const pacProxyError = computed(() => validatePacProxyString(form.pacProxy));
const listUrlError = computed(() => {
  if (form.mode !== "remote") return "";
  if (!form.listUrl.trim()) return t("settings.listUrlRequired");
  if (!looksLikeUrl(form.listUrl.trim()))
    return t("settings.listUrlInvalid");
  return "";
});
const ruleAnalysis = computed(() => analyzeDomainRules(form.directListText, form.blockListText));
const directRuleDiagnostics = computed(() => ruleAnalysis.value.direct.diagnostics);
const blockRuleDiagnostics = computed(() => ruleAnalysis.value.block.diagnostics);
const directListError = computed(() => validateDomainRules(form.directListText, t("settings.directList")));
const blockListError = computed(() => validateDomainRules(form.blockListText, t("settings.blockList")));
const timezoneError = computed(() =>
  isValidTimeZone(form.timezone) ? "" : t("settings.timezoneInvalid")
);
const cronError = computed(() => (form.cronSchedule.trim() ? cronParse.value.error : ""));
const webhookValidation = computed(() => ({
  success: validateWebhookDraft(form.webhookSuccessConfig, t("settings.successChannel")),
  failure: validateWebhookDraft(form.webhookFailureConfig, t("settings.failureChannel")),
}));

/** 保存前统一校验；错误列表为空才允许保存和生成 PAC。 */
const formErrors = computed(() => {
  const errs: string[] = [];
  if (timezoneError.value) errs.push(timezoneError.value);
  if (pacProxyError.value) errs.push(pacProxyError.value);
  if (listUrlError.value) errs.push(listUrlError.value);
  if (directListError.value) errs.push(directListError.value);
  if (blockListError.value) errs.push(blockListError.value);
  if (cronError.value) errs.push(t("settings.cronInvalid") + cronError.value);
  errs.push(...webhookErrorMessages(webhookValidation.value.success));
  errs.push(...webhookErrorMessages(webhookValidation.value.failure));
  return errs;
});

type ValidationTarget = { key: string; message: string };
const validationTargets = computed<ValidationTarget[]>(() => {
  const targets: ValidationTarget[] = [];
  if (timezoneError.value) targets.push({ key: "timezone", message: timezoneError.value });
  if (pacProxyError.value) targets.push({ key: "pac-proxy", message: pacProxyError.value });
  if (listUrlError.value) targets.push({ key: "list-url", message: listUrlError.value });
  if (directListError.value) targets.push({ key: "direct-list", message: directListError.value });
  if (blockListError.value) targets.push({ key: "block-list", message: blockListError.value });
  if (cronError.value) targets.push({ key: "cron", message: cronError.value });
  const channels = [
    { key: "success", errors: webhookValidation.value.success },
    { key: "failure", errors: webhookValidation.value.failure },
  ];
  for (const channel of channels) {
    for (const field of ["url", "headers", "body", "testBody", "secret"] as const) {
      const message = channel.errors[field];
      if (message)
        targets.push({
          key: channel.key + "-" + (field === "testBody" ? "test-body" : field),
          message,
        });
    }
  }
  return targets;
});

async function jumpToFirstError(): Promise<void> {
  const first = validationTargets.value[0];
  if (!first) return;
  await nextTick();
  const element = document.querySelector<HTMLElement>(
    '[data-validation-target="' + first.key + '"]'
  );
  if (!element) return;
  element.scrollIntoView({ behavior: "smooth", block: "center" });
  const control = element.querySelector<HTMLElement>(
    'input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [contenteditable="true"]'
  );
  control?.focus({ preventScroll: true });
}

function handleFloatingSaveClick(): void {
  if (formErrors.value.length) void jumpToFirstError();
}

const canSubmit = computed(() => formErrors.value.length === 0 && !saving.value);

function applySettings(s: AppSettings) {
  form.mode = s.mode;
  form.pacProxy = s.pacProxy;
  form.pacCompress = s.pacCompress;
  form.listUrl = s.listUrl;
  form.directListText = s.directList.join("\n");
  form.blockListText = s.blockList.join("\n");
  form.cronSchedule = s.cronSchedule;
  form.timezone = s.timezone || "Asia/Shanghai";
  form.locale = s.locale === "en_US" ? "en_US" : "zh_CN";
  form.proxyTestUrl = s.proxyTestUrl || "https://www.google.com/generate_204";
  form.logRetentionDays = Number.isFinite(s.logRetentionDays) ? s.logRetentionDays : 30;
  form.webhookSuccessUrl = s.webhookSuccessUrl;
  form.webhookSuccessBody = s.webhookSuccessBody;
  form.webhookFailureUrl = s.webhookFailureUrl;
  form.webhookFailureBody = s.webhookFailureBody;
  form.webhookSuccessConfig = normalizedWebhookConfig(
    s.webhookSuccessConfig,
    s.webhookSuccessUrl,
    s.webhookSuccessBody
  );
  form.webhookFailureConfig = normalizedWebhookConfig(
    s.webhookFailureConfig,
    s.webhookFailureUrl,
    s.webhookFailureBody
  );
}

function toPayload(): AppSettings {
  const split = (t: string) =>
    t
      .split(/[\n,]+/)
      .map((x) => x.trim())
      .filter(Boolean);
  return {
    mode: form.mode,
    pacProxy: form.pacProxy,
    pacCompress: form.pacCompress,
    listUrl: form.listUrl,
    directList: split(form.directListText),
    blockList: split(form.blockListText),
    cronSchedule: form.cronSchedule,
    timezone: form.timezone.trim(),
    locale: form.locale === "en_US" ? "en_US" : "zh_CN",
    proxyTestUrl: form.proxyTestUrl.trim(),
    logRetentionDays: form.logRetentionDays,
    webhookSuccessUrl: form.webhookSuccessConfig.url,
    webhookSuccessBody: form.webhookSuccessConfig.body,
    webhookFailureUrl: form.webhookFailureConfig.url,
    webhookFailureBody: form.webhookFailureConfig.body,
    webhookSuccessConfig: { ...form.webhookSuccessConfig },
    webhookFailureConfig: { ...form.webhookFailureConfig },
  };
}

function settingsSnapshot(): string {
  return JSON.stringify(toPayload());
}

const hasUnsavedSettings = computed(
  () => savedSettingsSnapshot.value !== "" && settingsSnapshot() !== savedSettingsSnapshot.value
);

async function load() {
  loading.value = true;
  error.value = "";
  try {
    const session = await api.session();
    securityStatus.value = {
      isDefaultPassword: session.isDefaultPassword,
      mustChangePassword: session.mustChangePassword,
    };
    if (!session.loggedIn) {
      await router.replace("/admin/login");
      return;
    }
    if (session.mustChangePassword) return;
    const [settings, logList, probe] = await Promise.all([
      api.settings(),
      api.logsPage(logPageSize, 0),
      api.genpacStatus().catch(
        (): GenpacProbe => ({
          available: false,
          command: null,
          detail: t("settings.engineUnknown"),
        })
      ),
    ]);
    applySettings(settings);
    savedSettingsSnapshot.value = settingsSnapshot();
    logs.value = logList.items;
    logHasMore.value = logList.hasMore;
    logTotal.value = logList.total;
    genpacProbe.value = probe;
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
    if (String(error.value).toLowerCase().includes("unauthorized")) {
      await router.replace("/admin/login");
    }
  } finally {
    loading.value = false;
    await nextTick();
    if (route.hash) void scrollToCurrentSection();
  }
}

onMounted(load);

async function saveAndGenerate() {
  if (saving.value) return;
  flash.value = "";
  error.value = "";
  if (formErrors.value.length) {
    await jumpToFirstError();
    return;
  }
  const payload = toPayload();
  const submittedSnapshot = JSON.stringify(payload);
  saving.value = true;
  try {
    // 服务端先持久化配置，再启动独立工作流并立即返回任务 ID。
    const workflow = await api.saveAndGenerate(payload);
    savedSettingsSnapshot.value = submittedSnapshot;
    showFlash(t("settings.saveSuccess"));
    notify(
      workflow.status === "pending"
        ? t("settings.workflowQueued", { id: workflow.workflowId })
        : t("settings.workflowStartedId", { id: workflow.workflowId }),
      "success"
    );
    // 日志/状态刷新只是辅助操作，不能反过来影响已经成功启动的任务。
    await refreshLogs().catch(() => null);
    const latestProbe = await api.genpacStatus().catch(() => null);
    if (latestProbe) genpacProbe.value = latestProbe;
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
    notify(error.value, "error");
  } finally {
    saving.value = false;
  }
}

async function testWebhook(kind: "success" | "failure") {
  const state = webhookTestState[kind];
  const config = kind === "success" ? form.webhookSuccessConfig : form.webhookFailureConfig;
  state.message = "";
  state.ok = null;

  const configured = Boolean(config.url.trim());
  if (!configured) {
    state.ok = false;
    state.message = t("settings.webhookNeedTarget");
    return;
  }
  const validationErrors = webhookErrorMessages(
    validateWebhookDraft(config, kind === "success" ? t("settings.successChannel") : t("settings.failureChannel"))
  );
  if (validationErrors.length) {
    state.ok = false;
    state.message = validationErrors.join("\n");
    return;
  }

  state.pending = true;
  try {
    const result = await api.testWebhook({ config: { ...config } });
    state.ok = result.success;
    state.message = result.success
      ? t("settings.webhookTestAccepted", { status: result.status ?? t("common.unknown") })
      : result.status
        ? t("settings.webhookTestFailed", { detail: `${result.message} (HTTP ${result.status})` })
        : t("settings.webhookTestFailed", { detail: result.message });
    notify(state.message, result.success ? "success" : "error");
  } catch (e) {
    state.ok = false;
    state.message = e instanceof Error ? e.message : String(e);
    notify(state.message, "error");
  } finally {
    state.pending = false;
  }
}

async function changeAdminPassword() {
  flash.value = "";
  error.value = "";
  if (!passwordForm.currentPassword) {
    error.value = t("settings.enterCurrentPassword");
    return;
  }
  if (passwordForm.newPassword !== passwordForm.confirmPassword) {
    error.value = t("settings.passwordMismatch");
    return;
  }
  passwordSaving.value = true;
  try {
    await api.changePassword({
      currentPassword: passwordForm.currentPassword,
      newPassword: passwordForm.newPassword,
    });
    const { invalidateAdminSessionCache } = await import("../composables/useAdminSession");
    invalidateAdminSessionCache();
    notify(t("settings.passwordChangedOk"), "success");
    await router.replace({ path: "/admin/login", query: { passwordChanged: "1" } });
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("settings.passwordChangeFailed");
    notify(error.value, "error");
  } finally {
    passwordSaving.value = false;
  }
}
</script>

<template>
  <AdminLayout
    active="settings"
    :title="t('settings.title')"
    :subtitle="t('settings.subtitle')"
  >
    <div class="admin-page">
      <section v-if="loading" class="state-card" aria-live="polite">
        <span class="spinner" aria-hidden="true"></span>
        <div>
          <strong>{{ t("settings.loading") }}</strong>
          <p>{{ t("settings.loadingDesc") }}</p>
        </div>
      </section>
      <div v-if="flash" class="banner" :class="flashOk ? 'ok' : 'bad'">
        <span class="banner-icon" aria-hidden="true"
          ><AppIcon :name="flashOk ? 'circle-check' : 'circle-alert'" :size="15"
        /></span>
        <pre class="banner-text">{{ flash }}</pre>
      </div>
      <div v-if="error" class="banner bad">
        <span class="banner-icon" aria-hidden="true"
          ><AppIcon name="circle-alert" :size="15"
        /></span>
        <pre class="banner-text">{{ error }}</pre>
      </div>

      <template v-if="!loading && !error">
        <section id="security" class="card security-card">
          <div class="card-head">
            <div>
              <h2>{{ t("settings.changePasswordTitle") }}</h2>
              <p class="card-sub">{{ t("settings.passwordStoredLocal") }}</p>
            </div>
          </div>
          <div v-if="securityStatus.isDefaultPassword" class="password-warning" role="alert">
            <strong>{{ t("settings.defaultPasswordAlert") }}</strong>
            <p>
              {{ t("settings.defaultPasswordTip") }}
            </p>
          </div>
          <div v-if="securityStatus.mustChangePassword" class="password-warning" role="alert">
            <strong>{{ t("settings.needNewPassword") }}</strong>
            <p>{{ t("settings.tempPasswordNote") }}</p>
          </div>
          <form class="password-change-form" @submit.prevent="changeAdminPassword">
            <div class="field">
              <label for="current-admin-password">{{ t("settings.currentPassword") }}</label>
              <input
                id="current-admin-password"
                v-model="passwordForm.currentPassword"
                type="password"
                autocomplete="current-password"
                required
              />
            </div>
            <div class="field">
              <label for="new-admin-password">{{ t("settings.newPassword") }}</label>
              <input
                id="new-admin-password"
                v-model="passwordForm.newPassword"
                type="password"
                autocomplete="new-password"
                required
                :placeholder="t('settings.newPasswordPlaceholder')"
              />
            </div>
            <div class="field">
              <label for="confirm-admin-password">{{ t("settings.confirmPassword") }}</label>
              <input
                id="confirm-admin-password"
                v-model="passwordForm.confirmPassword"
                type="password"
                autocomplete="new-password"
                required
              />
            </div>
            <div class="actions">
              <button
                type="submit"
                class="btn primary"
                :class="{ 'is-loading': passwordSaving }"
                :disabled="passwordSaving"
                :title="passwordSaving ? t('settings.changingPasswordTitle') : t('settings.changePasswordTitle')"
              >
                {{ passwordSaving ? t("settings.changingPassword") : t("settings.changePassword") }}
              </button>
            </div>
          </form>
          <p class="field-hint">
            {{ t("settings.resetHelpFull") }}<a
              href="https://github.com/geekMus/genpac-runner#常见问题"
              target="_blank"
              rel="noopener noreferrer"
              >{{ t("settings.resetHelpLink") }}</a
            >
          </p>
        </section>

        <form
          id="settings-form"
          v-if="!securityStatus.mustChangePassword"
          class="stack"
          :inert="saving"
          :aria-busy="saving"
          @submit.prevent="saveAndGenerate"
        >
          <!-- 常规设置 -->
          <section id="general" class="card">
            <div class="card-head">
              <div class="card-title">
                <span class="icon-badge" aria-hidden="true"
                  ><AppIcon name="calendar-clock" :size="18"
                /></span>
                <div>
                  <h2>{{ t("settings.general") }}</h2>
                  <p class="card-sub">{{ t("settings.generalDesc") }}</p>
                </div>
              </div>
            </div>
            <div class="field" data-validation-target="timezone">
              <label for="timezone">{{ t("settings.timezone") }}</label>
              <div class="timezone-picker desktop-timezone-picker">
                <input
                  id="timezone"
                  v-model="form.timezone"
                  autocomplete="off"
                  spellcheck="false"
                  :placeholder="t('settings.timezoneSearch')"
                  :aria-invalid="Boolean(timezoneError)"
                  @focus="
                    timezoneMenuOpen = true;
                    timezoneQuery = '';
                  "
                  @input="timezoneQuery = form.timezone"
                  @blur="closeTimezoneMenu"
                  @keydown.esc="timezoneMenuOpen = false"
                />
                <div
                  v-if="timezoneMenuOpen"
                  class="timezone-options-menu"
                  role="listbox"
                  :aria-label="t('settings.timezoneSuggest')"
                >
                  <button
                    v-for="zone in filteredTimeZones"
                    :key="zone.value"
                    type="button"
                    role="option"
                    :aria-selected="form.timezone === zone.value"
                    class="timezone-option"
                    @pointerdown.prevent="selectTimeZone(zone.value)"
                  >
                    <span>{{ t(zone.labelKey) }}</span
                    ><code>{{ zone.value }}</code>
                  </button>
                  <p v-if="filteredTimeZones.length === 0" class="timezone-no-results">
                    {{ t("settings.timezoneNoMatch") }}
                  </p>
                </div>
              </div>
              <button
                type="button"
                class="mobile-timezone-trigger"
                @click="openMobileTimezonePicker"
              >
                <span>{{ form.timezone || t("settings.selectTimezone") }}</span>
                <span class="mobile-timezone-trigger-icon" aria-hidden="true"
                  ><AppIcon name="chevron-down" :size="17"
                /></span>
              </button>
              <p class="field-hint">
                {{ t("settings.timezoneHintFull") }}
              </p>
              <p v-if="timezoneError" class="field-error" role="alert">{{ timezoneError }}</p>
            </div>

            <div
              v-if="mobileTimezoneOpen"
              class="timezone-sheet-backdrop"
              @click.self="mobileTimezoneOpen = false"
            >
              <section
                class="timezone-sheet"
                role="dialog"
                aria-modal="true"
                aria-labelledby="mobile-timezone-title"
                @keydown.esc="mobileTimezoneOpen = false"
              >
                <header class="timezone-sheet-head">
                  <h3 id="mobile-timezone-title">{{ t("settings.selectTimezone") }}</h3>
                  <button
                    type="button"
                    class="timezone-sheet-close"
                    :aria-label="t('settings.closeTimezone')"
                    @click="mobileTimezoneOpen = false"
                  >
                    <AppIcon name="x" :size="18" />
                  </button>
                </header>
                <input
                  v-model="timezoneQuery"
                  class="timezone-sheet-search"
                  type="search"
                  autocomplete="off"
                  :placeholder="t('settings.timezoneSearchShort')"
                  @keydown.enter.prevent
                />
                <div class="timezone-sheet-options" role="listbox" :aria-label="t('settings.timezoneSuggest')">
                  <button
                    v-for="zone in filteredTimeZones"
                    :key="zone.value"
                    type="button"
                    role="option"
                    :aria-selected="form.timezone === zone.value"
                    class="timezone-option"
                    @click="selectTimeZone(zone.value)"
                  >
                    <span>{{ t(zone.labelKey) }}</span
                    ><code>{{ zone.value }}</code>
                  </button>
                  <button
                    v-if="
                      timezoneQuery.trim() &&
                      isValidTimeZone(timezoneQuery) &&
                      !commonTimeZones.some(
                        (zone) => zone.value.toLowerCase() === timezoneQuery.trim().toLowerCase()
                      )
                    "
                    type="button"
                    role="option"
                    class="timezone-option timezone-custom-option"
                    @click="selectTimeZone(timezoneQuery.trim())"
                  >
                    <span>{{ t("settings.useCustomTimezone") }}</span><code>{{ timezoneQuery.trim() }}</code>
                  </button>
                  <p
                    v-if="filteredTimeZones.length === 0 && !isValidTimeZone(timezoneQuery)"
                    class="timezone-no-results"
                  >
                    {{ t("settings.timezoneNoMatchStrict") }}
                  </p>
                </div>
                <p class="timezone-sheet-hint">
                  {{ t("settings.timezoneSelectHint") }}
                </p>
              </section>
            </div>
            <div class="chip-row timezone-presets">
              <button
                v-for="zone in commonTimeZones.slice(0, 6)"
                :key="zone.value"
                type="button"
                class="chip"
                :class="{ active: form.timezone === zone.value }"
                @click="form.timezone = zone.value"
              >
                {{ t(zone.labelKey) }}
              </button>
            </div>
          </section>

          <!-- 模式 -->
          <section id="mode" class="card">
            <div class="card-head">
              <div class="card-title">
                <span class="icon-badge" aria-hidden="true">
                  <AppIcon name="workflow" :size="18" />
                </span>
                <div>
                  <h2>{{ t("settings.startMode") }}</h2>
                  <p class="card-sub">{{ t("settings.startModeDesc") }}</p>
                </div>
              </div>
            </div>

            <div class="mode-grid">
              <label class="mode-card" :class="{ active: form.mode === 'custom' }">
                <input v-model="form.mode" type="radio" value="custom" />
                <div class="mode-card-body">
                  <div class="mode-top">
                    <span class="mode-name">{{ t("settings.customRules") }}</span>
                    <span class="tag">{{ t("settings.recommended") }}</span>
                  </div>
                  <p class="mode-desc">{{ t("settings.customModeDesc") }}</p>
                </div>
              </label>
              <label class="mode-card" :class="{ active: form.mode === 'remote' }">
                <input v-model="form.mode" type="radio" value="remote" />
                <div class="mode-card-body">
                  <div class="mode-top">
                    <span class="mode-name">{{ t("settings.remoteRules") }}</span>
                    <span class="tag">{{ t("settings.bunBuiltin") }}</span>
                  </div>
                  <p class="mode-desc">
                    {{ t("settings.remoteModeDesc") }}
                  </p>
                </div>
              </label>
            </div>

            <p class="hint-line">{{ modeHint }}</p>

            <div
              v-if="form.mode === 'remote' && genpacProbe"
              class="probe"
              :class="genpacProbe.available ? 'ok' : 'warn'"
            >
              <strong>{{ genpacProbe.available ? t("settings.engineReady") : t("settings.engineAbnormal") }}</strong>
              <span>{{ genpacProbe.detail }}</span>
              <span v-if="!genpacProbe.available" class="probe-help">
                {{ t("settings.engineHint") }}
              </span>
            </div>
          </section>

          <!-- 代理 -->
          <section id="proxy" class="card">
            <div class="card-head">
              <div class="card-title">
                <span class="icon-badge" aria-hidden="true">
                  <AppIcon name="globe" :size="18" />
                </span>
                <div>
                  <h2>{{ t("settings.proxyAndRemote") }}</h2>
                  <p class="card-sub">{{ t("settings.proxyAndRemoteDesc") }}</p>
                </div>
              </div>
            </div>

            <div class="field" data-validation-target="pac-proxy">
              <label for="pacProxy">{{ t("settings.pacProxy") }}</label>
              <input
                id="pacProxy"
                v-model="form.pacProxy"
                :aria-invalid="Boolean(pacProxyError)"
                placeholder="SOCKS5 127.0.0.1:1080; DIRECT"
              />
              <p class="field-hint">
                {{ t("settings.pacProxyHintFull") }}
              </p>
              <p v-if="pacProxyError" class="field-error" role="alert">{{ pacProxyError }}</p>
            </div>
            <div
              class="field"
              :class="{ 'is-disabled': form.mode !== 'remote' }"
              data-validation-target="list-url"
            >
              <label for="listUrl"
                >{{ t("settings.listUrlLabel") }}
                <span class="lab-hint">{{ t("settings.listUrlLabHint") }}</span></label
              >
              <input
                id="listUrl"
                v-model="form.listUrl"
                :disabled="form.mode !== 'remote'"
                :aria-disabled="form.mode !== 'remote'"
                :aria-invalid="Boolean(listUrlError)"
                placeholder="https://example.com/list.txt"
              />
              <p class="field-hint">
                {{ t("settings.listUrlDescFull") }}<span
                  v-if="form.mode !== 'remote'"
                  class="disabled-hint"
                  >{{ t("settings.listUrlEditWhenRemote") }}</span
                >
              </p>
              <p v-if="listUrlError" class="field-error" role="alert">{{ listUrlError }}</p>
            </div>
            <div class="checks">
              <label class="check">
                <input v-model="form.pacCompress" type="checkbox" />
                <span>{{ t("settings.compressPac") }}</span>
              </label>
            </div>
            <p class="field-hint">
              {{ t("settings.compressPacHintFull") }}
            </p>
          </section>

          <!-- 规则列表 -->
          <section id="rules" class="card">
            <div class="card-head">
              <div class="card-title">
                <span class="icon-badge" aria-hidden="true">
                  <AppIcon name="list-checks" :size="18" />
                </span>
                <div>
                  <h2>{{ t("settings.customRulesTitle") }}</h2>
                  <p class="card-sub">{{ t("settings.customRulesDesc") }}</p>
                </div>
              </div>
            </div>

            <details class="help">
              <summary>{{ t("settings.howToConfig") }}</summary>
              <div class="help-body">
                <p>
                  {{ t("settings.writing") }} {{ t("settings.writingFull") }}
                </p>
                <p><strong>{{ t("settings.directListLabel") }}</strong>{{ t("settings.directHit") }}</p>
                <p>
                  <strong>{{ t("settings.blockListLabel") }}</strong>{{ t("settings.blockHit") }}
                </p>
                <p><strong>{{ t("settings.matchOrder") }}</strong></p>
                <ol>
                  <li>{{ t("settings.matchLocal") }}</li>
                  <li>{{ t("settings.matchBlock") }}</li>
                  <li>{{ t("settings.matchDirect") }}</li>
                  <li>{{ t("settings.matchRemote") }}</li>
                  <li>{{ t("settings.matchCustomRest") }}</li>
                </ol>
              </div>
            </details>

            <div class="split editors">
              <div class="field" data-validation-target="direct-list">
                <label>{{ t("settings.directList") }}</label>
                <DomainListEditor
                  v-model="form.directListText"
                  :height="320"
                  :invalid="Boolean(directListError)"
                  :diagnostics="directRuleDiagnostics"
                  placeholder="example.com&#10;*.example.org&#10;**.example.net"
                />
                <p v-if="directListError" class="field-error" role="alert">{{ directListError }}</p>
              </div>
              <div class="field" data-validation-target="block-list">
                <label>{{ t("settings.blockList") }}</label>
                <DomainListEditor
                  v-model="form.blockListText"
                  :height="320"
                  :invalid="Boolean(blockListError)"
                  :diagnostics="blockRuleDiagnostics"
                  placeholder="ads.example.com"
                />
                <p v-if="blockListError" class="field-error" role="alert">{{ blockListError }}</p>
              </div>
            </div>
            <div
              v-if="ruleAnalysis.totalErrors || ruleAnalysis.totalWarnings"
              class="rule-analysis-summary"
              aria-live="polite"
            >
              <div class="rule-analysis-title">
                {{ t("settings.ruleCheckSummary", { errors: ruleAnalysis.totalErrors, warnings: ruleAnalysis.totalWarnings }) }}
              </div>
              <p v-if="ruleAnalysis.totalErrors" class="field-error">
                {{ t("settings.ruleCheckFixErrors") }}
              </p>
              <p v-if="ruleAnalysis.totalWarnings" class="field-hint">
                {{ t("settings.ruleCheckHints") }}
              </p>
            </div>
          </section>

          <!-- 定时与 webhook -->
          <section id="schedule" class="card">
            <div class="card-head">
              <div class="card-title">
                <span class="icon-badge" aria-hidden="true">
                  <AppIcon name="calendar-clock" :size="18" />
                </span>
                <div>
                  <h2>{{ t("settings.scheduleWebhook") }}</h2>
                  <p class="card-sub">
                    {{ t("settings.scheduleWebhookDesc") }}
                  </p>
                </div>
              </div>
            </div>

            <div class="sub-block">
              <div class="sub-title">{{ t("dashboard.scheduledGen") }}</div>
              <div class="chip-row" role="group" :aria-label="t('settings.cronPreset')">
                <button
                  v-for="p in cronPresets"
                  :key="p.value || p.labelKey"
                  type="button"
                  class="chip"
                  :class="{ active: form.cronSchedule.trim() === p.value }"
                  @click="applyCronPreset(p.value)"
                >
                  {{ t(p.labelKey) }}
                </button>
              </div>
              <div class="field" data-validation-target="cron">
                <label for="cron"
                  >{{ t("settings.cronExpr") }} <span class="lab-hint">{{ t("settings.cronFields") }}</span></label
                >
                <input
                  id="cron"
                  v-model="form.cronSchedule"
                  class="mono"
                  :aria-invalid="Boolean(cronError)"
                  spellcheck="false"
                  autocomplete="off"
                  :placeholder="t('settings.cronExample')"
                />
                <p
                  class="field-hint"
                  :class="{ 'field-error': Boolean(cronError) }"
                  :aria-live="cronError ? 'polite' : undefined"
                >
                  {{ cronHint }}
                </p>
              </div>
            </div>

            <div class="webhook-grid">
              <WebhookChannelEditor
                :title="t('settings.successNotify')"
                kind="success"
                :model-value="form.webhookSuccessConfig"
                :pending="webhookTestState.success.pending"
                :result-message="webhookTestState.success.message"
                :result-ok="webhookTestState.success.ok"
                :validation-errors="webhookValidation.success"
                @update:model-value="form.webhookSuccessConfig = $event"
                @test="testWebhook('success')"
              />
              <WebhookChannelEditor
                :title="t('settings.failureNotify')"
                kind="failure"
                :model-value="form.webhookFailureConfig"
                :pending="webhookTestState.failure.pending"
                :result-message="webhookTestState.failure.message"
                :result-ok="webhookTestState.failure.ok"
                :validation-errors="webhookValidation.failure"
                @update:model-value="form.webhookFailureConfig = $event"
                @test="testWebhook('failure')"
              />
            </div>
          </section>

          <div class="actions-block">
            <div v-if="formErrors.length" class="validation-box">
              <div class="validation-title">{{ t("settings.fixBeforeSave") }}</div>
              <ul>
                <li v-for="(e, i) in formErrors" :key="i">{{ e }}</li>
              </ul>
            </div>
            <p class="actions-hint">
              {{ t("settings.floatingSaveHint") }}
            </p>
          </div>
        </form>

        <section id="logs" class="card">
          <div class="card-head">
            <div class="card-title">
              <span class="icon-badge" aria-hidden="true">
                <AppIcon name="chart" :size="18" />
              </span>
              <div>
                <h2>{{ t("settings.recentLogs") }}</h2>
                <p class="card-sub">{{ t("settings.loadedLogs", { loaded: logs.length, total: logTotal }) }}</p>
              </div>
            </div>
          </div>
          <VirtualTable
            :items="logs"
            item-key="id"
            :col-span="4"
            :row-height="58"
            height="420px"
            min-width="700px"
            :has-more="logHasMore"
            :loading="logLoadingMore"
            :error="logLoadError"
            :empty-text="t('settings.noLogs')"
            :load-more="loadMoreLogs"
          >
            <template #columns
              ><col style="width: 145px" />
              <col style="width: 78px" />
              <col style="width: 120px" />
              <col style="width: 357px"
            /></template>
            <template #header
              ><tr>
                <th>{{ t("settings.colTime") }}</th>
                <th>{{ t("settings.colResult") }}</th>
                <th>{{ t("settings.colMode") }}</th>
                <th>{{ t("settings.colMessage") }}</th>
              </tr></template
            >
            <template #row="{ item: l }">
              <tr>
                <td class="nowrap">{{ l.created_at }}</td>
                <td>
                  <span class="pill" :class="l.success ? 'ok' : 'bad'">{{
                    l.success ? t("common.success") : t("common.failed")
                  }}</span>
                </td>
                <td>{{ l.mode }}</td>
                <td class="msg">
                  <TextDetail
                    :text="localizedText(l.message, l.message_key, l.message_params)"
                    :label="t('settings.genLogInfo')"
                  />
                </td>
              </tr>
            </template>
          </VirtualTable>
        </section>

        <button
          v-if="!securityStatus.mustChangePassword && hasUnsavedSettings"
          form="settings-form"
          :type="canSubmit ? 'submit' : 'button'"
          class="floating-save-button"
          :class="{ 'is-loading': saving, 'has-errors': formErrors.length > 0 && !saving }"
          :disabled="saving"
          :aria-busy="saving"
          :aria-invalid="formErrors.length > 0 ? 'true' : undefined"
          :aria-label="
            saving
              ? t('settings.savingAndGenerating')
              : formErrors.length
                ? t('settings.validationIssues')
                : t('settings.saveAndGenerate')
          "
          :title="
            saving
              ? t('settings.savingAndGenerating')
              : formErrors.length
                ? t('settings.validationIssues')
                : t('settings.saveAndGenerate')
          "
          @click="handleFloatingSaveClick"
        >
          <AppIcon
            :name="saving ? 'loader-circle' : formErrors.length ? 'circle-alert' : 'save'"
            :size="21"
            :class="{ 'save-spinner': saving }"
          />
        </button>
      </template>
      <AppFooter />
    </div>
  </AdminLayout>
</template>

<style scoped>
.admin-page {
  min-width: 0;
  padding-bottom: 90px;
}

.floating-save-button {
  position: fixed;
  z-index: 40;
  right: 24px;
  bottom: 24px;
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  padding: 0;
  border: 1px solid var(--accent);
  border-radius: 18px;
  background: var(--accent);
  color: var(--accent-contrast) !important;
  -webkit-text-fill-color: var(--accent-contrast);
  box-shadow: 0 8px 22px color-mix(in srgb, var(--accent) 28%, transparent);
  cursor: pointer;
  transition:
    background 0.15s,
    border-color 0.15s,
    box-shadow 0.15s,
    transform 0.15s;
}
.floating-save-button svg {
  flex: 0 0 auto;
}
.floating-save-button:hover:not(:disabled) {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
  color: var(--accent-contrast) !important;
  -webkit-text-fill-color: var(--accent-contrast);
  box-shadow: 0 10px 26px color-mix(in srgb, var(--accent) 34%, transparent);
  transform: translateY(-2px);
}
.floating-save-button:active:not(:disabled) {
  background: var(--accent-active);
  border-color: var(--accent-active);
  color: var(--accent-contrast) !important;
  -webkit-text-fill-color: var(--accent-contrast);
  box-shadow: 0 3px 10px color-mix(in srgb, var(--accent) 24%, transparent);
  transform: translateY(0);
}
.floating-save-button:focus-visible {
  outline: 3px solid color-mix(in srgb, var(--accent) 42%, transparent);
  outline-offset: 4px;
}
.floating-save-button.has-errors,
.floating-save-button.has-errors:disabled {
  background: var(--warn-soft);
  background-color: var(--warn-soft);
  border-color: var(--warn);
  color: var(--warn) !important;
  -webkit-text-fill-color: var(--warn);
  box-shadow: 0 8px 22px color-mix(in srgb, var(--warn) 18%, transparent);
  cursor: pointer;
}
.floating-save-button.has-errors:hover:not(:disabled) {
  background: color-mix(in srgb, var(--warn) 20%, var(--surface));
  border-color: var(--warn);
  color: var(--warn) !important;
  -webkit-text-fill-color: var(--warn);
  box-shadow: 0 10px 26px color-mix(in srgb, var(--warn) 24%, transparent);
}
.floating-save-button.is-loading:disabled {
  opacity: 1;
  cursor: progress;
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-contrast) !important;
  -webkit-text-fill-color: var(--accent-contrast);
  box-shadow: none;
  transform: none;
}
.admin-logout-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  padding: 0 11px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}
.admin-logout-button:hover {
  border-color: var(--accent);
  color: var(--accent);
}
#security,
#general,
#mode,
#proxy,
#rules,
#schedule,
#logs {
  scroll-margin-top: 110px;
}
.state-card {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 18px;
  margin-bottom: var(--space-3);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
}
.state-card strong {
  display: block;
  font-size: 14px;
  color: var(--text);
}
.state-card p {
  margin: 5px 0 0;
  color: var(--muted);
  font-size: 13px;
}
.spinner {
  width: 18px;
  height: 18px;
  border: 2px solid var(--line);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: admin-spin 0.8s linear infinite;
  flex: 0 0 auto;
}
@keyframes admin-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .spinner {
    animation-duration: 0.01ms;
    animation-iteration-count: 1;
  }
}
.banner {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 12px 14px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--line);
  margin-bottom: var(--space-3);
  background: var(--surface);
}
.banner.ok {
  background: var(--green-soft);
  border-color: color-mix(in srgb, var(--green) 35%, var(--line));
}
.banner.bad {
  background: var(--red-soft);
  border-color: color-mix(in srgb, var(--red) 35%, var(--line));
}
.banner-icon {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 12px;
  font-weight: 700;
  flex-shrink: 0;
  background: var(--surface);
  color: var(--text);
}
.banner.ok .banner-icon {
  color: var(--green);
}
.banner.bad .banner-icon {
  color: var(--red);
}
.banner-text {
  margin: 0;
  white-space: pre-wrap;
  font: inherit;
  flex: 1;
  line-height: 1.45;
}
.stack {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}
.card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: clamp(16px, 3vw, 24px) clamp(16px, 3.5vw, 28px);
  box-shadow: var(--shadow);
}
.card-head {
  margin-bottom: var(--space-4);
}
.card-title {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}
.icon-badge {
  width: 34px;
  height: 34px;
  border-radius: 9px;
  display: grid;
  place-items: center;
  background: var(--surface-2);
  color: var(--muted);
  border: 1px solid var(--line);
  flex-shrink: 0;
}
h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
}
.card-sub {
  margin: 2px 0 0;
  font-size: 13px;
  color: var(--muted);
}
.mode-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.mode-card {
  position: relative;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  padding: 14px;
  cursor: pointer;
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
}
.mode-card input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}
.mode-card:not(.active):hover {
  border-color: color-mix(in srgb, var(--accent) 48%, var(--line));
  background: var(--surface);
}
.mode-card.active {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-soft);
  background: var(--accent-soft);
}
.mode-card.active .mode-name {
  color: var(--accent);
}
.mode-card:focus-within {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}
.mode-card:active {
  transform: translateY(1px);
}
.check:not(.is-disabled):hover {
  border-color: color-mix(in srgb, var(--accent) 40%, var(--line));
  background: color-mix(in srgb, var(--accent) 5%, var(--surface-2));
}
.mode-top {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 6px;
}
.mode-name {
  font-weight: 700;
}
.tag {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--green-soft);
  color: var(--green);
}
.tag.muted {
  background: var(--surface-2);
  color: var(--muted);
  border: 1px solid var(--line);
}
.mode-desc {
  margin: 0;
  font-size: 13px;
  color: var(--muted);
  line-height: 1.45;
}
.hint-line {
  margin: 12px 0 0;
  font-size: 13px;
  color: var(--muted);
}
.probe {
  margin-top: 12px;
  padding: 12px 14px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
}
.probe.ok {
  background: var(--green-soft);
  border-color: color-mix(in srgb, var(--green) 30%, var(--line));
}
.probe.warn {
  background: var(--warn-soft);
  border-color: color-mix(in srgb, var(--warn) 35%, var(--line));
}
.probe-help {
  color: var(--muted);
}
.field {
  margin-bottom: var(--space-3);
}
.field:last-child {
  margin-bottom: 0;
}
.field label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 6px;
}
.lab-hint {
  font-weight: 500;
  color: var(--muted);
  margin-left: 6px;
}
input,
textarea {
  width: 100%;
  border: 1px solid var(--line);
  background: var(--bg);
  color: var(--text);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
}
input:focus,
textarea:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
textarea {
  resize: vertical;
  font-family: ui-monospace, Consolas, monospace;
  font-size: 13px;
  line-height: 1.45;
}
.checks {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
  margin-top: 8px;
}
.check {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: var(--touch);
  padding: 10px 14px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  font-size: 14px;
  cursor: pointer;
  user-select: none;
}
.check input {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  accent-color: var(--accent);
}
.check span {
  line-height: 1.3;
}
.split {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin: 4px 0 8px;
}
.btn {
  appearance: none;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--text);
  border-radius: var(--radius-sm);
  min-height: var(--touch);
  padding: 10px 18px;
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
  transition:
    background 0.15s,
    border-color 0.15s;
}
.btn:hover:not(:disabled) {
  background: var(--surface-2);
}
.btn.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-contrast);
}
.btn.primary:hover:not(:disabled) {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
  color: var(--accent-contrast);
  filter: none;
}
.btn.primary:active:not(:disabled) {
  background: var(--accent-active);
  border-color: var(--accent-active);
  color: var(--accent-contrast);
}
.btn:not(.primary):active:not(:disabled) {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--accent);
}
.admin-logout-button:active:not(:disabled),
.chip:active:not(:disabled),
.webhook-test-button:active:not(:disabled),
.timezone-option:active:not(:disabled) {
  background: var(--accent-soft);
  color: var(--accent);
}
.admin-page .actions .btn-save {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  min-width: 190px;
  min-height: 46px;
  padding: 11px 20px;
  background: var(--accent);
  border: 1px solid var(--accent);
  color: var(--accent-contrast) !important;
  -webkit-text-fill-color: var(--accent-contrast);
  font-weight: 750;
  letter-spacing: 0.01em;
  box-shadow: 0 5px 14px color-mix(in srgb, var(--accent) 22%, transparent);
  transition:
    background 0.15s,
    box-shadow 0.15s,
    transform 0.15s;
}
.admin-page .actions .btn-save svg {
  flex: 0 0 auto;
}
.admin-page .actions .btn-save:hover:not(:disabled),
.admin-page .actions .btn-save:active:not(:disabled) {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
  color: var(--accent-contrast) !important;
  -webkit-text-fill-color: var(--accent-contrast);
  box-shadow: 0 7px 18px color-mix(in srgb, var(--accent) 28%, transparent);
  filter: none;
  transform: translateY(-1px);
}
.admin-page .actions .btn-save:focus-visible {
  outline: 3px solid color-mix(in srgb, var(--accent) 34%, transparent);
  outline-offset: 3px;
}
.admin-page .actions .btn-save:active:not(:disabled) {
  background: var(--accent-active);
  border-color: var(--accent-active);
  color: var(--accent-contrast) !important;
  -webkit-text-fill-color: var(--accent-contrast);
  box-shadow: 0 2px 6px color-mix(in srgb, var(--accent) 20%, transparent);
  transform: translateY(0);
}
.admin-page .actions .btn-save:disabled {
  opacity: 1;
  cursor: not-allowed;
  background: var(--surface-2);
  border-color: var(--line);
  color: var(--muted) !important;
  -webkit-text-fill-color: var(--muted);
  box-shadow: none;
  transform: none;
}
.admin-page .actions .btn-save.is-loading:disabled {
  cursor: progress;
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-contrast) !important;
  -webkit-text-fill-color: var(--accent-contrast);
  box-shadow: none;
}
.save-spinner {
  width: 17px;
  height: 17px;
  animation: save-spin 0.8s linear infinite;
}
@keyframes save-spin {
  to {
    transform: rotate(360deg);
  }
}
.btn.ghost {
  background: transparent;
}
.btn:disabled {
  opacity: 1;
  color: var(--control-disabled-text);
  background: var(--control-disabled-bg);
  border-color: var(--control-disabled-border);
  -webkit-text-fill-color: var(--control-disabled-text);
  box-shadow: none;
  cursor: not-allowed;
}
.field.is-disabled label {
  color: var(--control-disabled-text);
}
.field.is-disabled .field-hint,
.field.is-disabled .disabled-hint,
.field.is-disabled .lab-hint {
  color: var(--control-disabled-text);
}
.admin-page .field.is-disabled input:disabled,
.admin-page .field.is-disabled select:disabled,
.admin-page .field.is-disabled textarea:disabled {
  color: var(--control-disabled-text);
  -webkit-text-fill-color: var(--control-disabled-text);
  background: var(--control-disabled-bg);
  border-color: var(--control-disabled-border);
  box-shadow: none;
  cursor: not-allowed;
  opacity: 1;
}
.check.is-disabled {
  color: var(--control-disabled-text);
  border-color: var(--control-disabled-border);
  background: var(--control-disabled-bg);
  cursor: not-allowed;
}
.check.is-disabled span {
  color: var(--control-disabled-text);
}
.check.is-disabled input {
  cursor: not-allowed;
  accent-color: var(--control-disabled-text);
}
.linkish {
  background: transparent;
  border: 0;
  color: var(--accent);
  padding: 0;
  font-size: 14px;
  cursor: pointer;
}
.table-wrap {
  overflow: auto;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
th,
td {
  text-align: left;
  padding: 10px 12px;
  border-bottom: 1px solid var(--line);
  vertical-align: top;
}
th {
  color: var(--muted);
  font-weight: 600;
  background: var(--surface-2);
}
tr:last-child td {
  border-bottom: 0;
}
.nowrap {
  white-space: nowrap;
}
.msg {
  max-width: 360px;
}
.empty {
  color: var(--muted);
  text-align: center;
}
.pill {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
}
.pill.ok {
  background: var(--green-soft);
  color: var(--green);
}
.pill.bad {
  background: var(--red-soft);
  color: var(--red);
}
@media (max-width: 720px) {
  .admin-page {
    padding-bottom: 100px;
  }
  .floating-save-button {
    right: 16px;
    bottom: max(16px, env(safe-area-inset-bottom));
    width: 52px;
    height: 52px;
    border-radius: 16px;
  }
  .mode-grid,
  .split {
    grid-template-columns: 1fr;
  }
  .actions {
    flex-direction: column;
  }
  .actions .btn {
    width: 100%;
  }
}

.help {
  margin: 0 0 var(--space-4);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  padding: 0 14px;
}
.help summary {
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  color: var(--muted);
  padding: 12px 0;
  list-style: none;
  display: flex;
  align-items: center;
  gap: 8px;
}
.help summary::-webkit-details-marker {
  display: none;
}
.help summary::before {
  content: "›";
  display: inline-block;
  transition: transform 0.15s;
  color: var(--accent);
  font-weight: 700;
}
.help[open] summary::before {
  transform: rotate(90deg);
}
.help-body {
  padding: 0 0 14px;
  font-size: 13px;
  color: var(--muted);
  line-height: 1.55;
}
.help-body p {
  margin: 0 0 10px;
}
.help-body ol {
  margin: 0;
  padding-left: 1.25em;
}
.help-body li {
  margin-bottom: 4px;
}
.split.editors {
  align-items: start;
}
.split.editors .field {
  margin-bottom: 0;
}
.rule-analysis-summary {
  margin-top: 14px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}
.rule-analysis-title {
  font-size: 13px;
  font-weight: 700;
}
.rule-analysis-summary .field-hint,
.rule-analysis-summary .field-error {
  margin-top: 4px;
}

.sub-block {
  margin-bottom: var(--space-4);
}
.sub-title {
  font-size: 13px;
  font-weight: 700;
  margin-bottom: 10px;
  color: var(--text);
}
.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 14px;
}
.chip {
  appearance: none;
  border: 1px solid var(--line);
  background: var(--surface-2);
  color: var(--text);
  border-radius: 999px;
  min-height: 34px;
  padding: 0 14px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition:
    background 0.15s,
    border-color 0.15s,
    color 0.15s;
}
.chip:hover {
  border-color: color-mix(in srgb, var(--accent) 40%, var(--line));
  color: var(--accent);
}
.chip.active {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--accent);
}
.field-hint {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--muted);
  line-height: 1.45;
}
.field-warn {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--warn);
  line-height: 1.45;
}
.field-error {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--red);
  line-height: 1.45;
  font-weight: 600;
}
.admin-page input[aria-invalid="true"],
.admin-page textarea[aria-invalid="true"],
.admin-page select[aria-invalid="true"] {
  border-color: var(--red) !important;
  box-shadow: 0 0 0 3px var(--red-soft) !important;
}

input.mono,
textarea.mono {
  font-family: var(--font-mono);
  font-size: 13px;
}
textarea.body-area {
  resize: vertical;
  min-height: 110px;
  line-height: 1.45;
}
.webhook-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}
.webhook-panel {
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  padding: 14px 14px 6px;
}
.webhook-panel.ok {
  border-color: color-mix(in srgb, var(--green) 28%, var(--line));
}
.webhook-panel.bad {
  border-color: color-mix(in srgb, var(--red) 28%, var(--line));
}
.webhook-panel-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 13px;
  font-weight: 700;
  margin-bottom: 12px;
}
.webhook-panel-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.webhook-test-button {
  border: 1px solid var(--line);
  border-radius: 7px;
  padding: 5px 10px;
  min-height: 30px;
  background: var(--surface);
  color: var(--text);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}
.webhook-test-button:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}
.webhook-test-button:disabled {
  opacity: 1;
  color: var(--control-disabled-text);
  -webkit-text-fill-color: var(--control-disabled-text);
  background: var(--control-disabled-bg);
  border-color: var(--control-disabled-border);
  box-shadow: none;
  cursor: not-allowed;
}
.webhook-test-result {
  margin: 0 0 10px;
  padding: 8px 10px;
  border-radius: 7px;
  font-size: 12px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}
.webhook-test-result.ok {
  background: var(--green-soft);
  color: var(--green);
}
.webhook-test-result.bad {
  background: var(--red-soft);
  color: var(--red);
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.dot.ok {
  background: var(--green);
}
.dot.bad {
  background: var(--red);
}
@media (max-width: 720px) {
  .webhook-grid {
    grid-template-columns: 1fr;
  }
}

.actions-block {
  margin: 8px 0 12px;
}
.validation-box {
  margin-bottom: 12px;
  padding: 12px 14px;
  border-radius: var(--radius-sm);
  border: 1px solid color-mix(in srgb, var(--warn) 40%, var(--line));
  background: var(--warn-soft);
  font-size: 13px;
}
.validation-title {
  font-weight: 700;
  margin-bottom: 6px;
  color: var(--text);
}
.validation-box ul {
  margin: 0;
  padding-left: 1.2em;
  color: var(--text);
}
.validation-box li {
  margin-bottom: 4px;
}
.actions-hint {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--muted);
}

.security-card {
  margin-bottom: 18px;
}
.password-warning {
  margin: 0 0 14px;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--warn) 45%, var(--line));
  border-radius: var(--radius-sm);
  background: var(--warn-soft);
  color: var(--text);
  font-size: 13px;
}
.password-warning p {
  margin: 5px 0 0;
  color: var(--muted);
  line-height: 1.5;
}
.password-change-form {
  max-width: 620px;
}
.password-change-form .actions {
  margin-top: 10px;
}
.timezone-presets {
  margin: 8px 0 0;
}
.timezone-picker {
  position: relative;
}
.timezone-options-menu {
  position: absolute;
  z-index: 30;
  top: calc(100% + 5px);
  left: 0;
  right: 0;
  max-height: 270px;
  overflow: auto;
  padding: 5px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
  box-shadow: var(--shadow);
}
.timezone-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  min-height: 44px;
  padding: 9px 10px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--text);
  text-align: left;
  cursor: pointer;
}
.timezone-option:hover,
.timezone-option[aria-selected="true"] {
  background: var(--accent-soft);
  color: var(--accent);
}
.timezone-option span {
  font-size: 12px;
}
.timezone-option code {
  color: var(--muted);
  font-size: 11px;
  white-space: nowrap;
}
.timezone-no-results {
  margin: 0;
  padding: 12px 10px;
  color: var(--muted);
  font-size: 12px;
}
.mobile-timezone-trigger {
  display: none;
}
.timezone-sheet-backdrop {
  display: none;
}
@media (max-width: 720px) {
  .desktop-timezone-picker {
    display: none;
  }
  .mobile-timezone-trigger {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    width: 100%;
    min-height: 46px;
    padding: 10px 12px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface-2);
    color: var(--text);
    font: inherit;
    text-align: left;
  }
  .mobile-timezone-trigger span:first-child {
    overflow-wrap: anywhere;
  }
  .mobile-timezone-trigger-icon {
    display: grid;
    place-items: center;
    color: var(--muted);
  }
  .timezone-sheet-backdrop {
    display: flex;
    position: fixed;
    z-index: 1000;
    inset: 0;
    align-items: flex-end;
    justify-content: center;
    padding: 0;
    background: rgba(0, 0, 0, 0.48);
  }
  .timezone-sheet {
    display: flex;
    flex-direction: column;
    width: 100%;
    max-height: min(82dvh, 720px);
    padding: 16px 16px max(16px, env(safe-area-inset-bottom));
    border-radius: 18px 18px 0 0;
    border: 1px solid var(--line);
    border-bottom: 0;
    background: var(--surface);
    box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.18);
  }
  .timezone-sheet-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
  }
  .timezone-sheet-head h3 {
    margin: 0;
    font-size: 16px;
  }
  .timezone-sheet-close {
    display: grid;
    place-items: center;
    flex: 0 0 36px;
    width: 36px;
    height: 36px;
    border: 0;
    border-radius: 8px;
    background: var(--surface-2);
    color: var(--text);
    font-size: 24px;
    line-height: 1;
  }
  .timezone-sheet-search {
    flex: 0 0 auto;
    width: 100%;
    min-height: 44px;
    margin-bottom: 10px;
    padding: 10px 12px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface-2);
    color: var(--text);
    font: inherit;
    font-size: 16px;
  }
  .timezone-sheet-options {
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
  }
  .timezone-sheet .timezone-option {
    min-height: 48px;
  }
  .timezone-sheet .timezone-option code {
    overflow-wrap: anywhere;
    white-space: normal;
    text-align: right;
  }
  .timezone-custom-option {
    border-top: 1px solid var(--line);
    margin-top: 4px;
  }
  .timezone-sheet-hint {
    margin: 10px 0 0;
    color: var(--muted);
    font-size: 12px;
    line-height: 1.45;
  }
}

.storage-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 18px;
}
.storage-metric {
  display: grid;
  gap: 7px;
  min-width: 0;
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: var(--surface-2);
}
.storage-metric span,
.storage-metric small {
  color: var(--muted);
  font-size: 11px;
}
.storage-metric strong {
  color: var(--text);
  font-size: 21px;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}
.storage-metric small {
  line-height: 1.5;
}
.retention-setting {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 15px 0;
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
}
.retention-copy strong {
  color: var(--text);
  font-size: 13px;
}
.retention-copy p,
.storage-note {
  margin: 6px 0 0;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.6;
}
.retention-control select {
  min-height: 40px;
  min-width: 140px;
  padding: 0 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
}
.storage-counts {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 13px;
}
.storage-counts span {
  padding: 5px 8px;
  border-radius: 6px;
  background: var(--surface-2);
  color: var(--muted);
  font-size: 10px;
}
.storage-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 9px;
  margin-top: 16px;
}
.storage-actions button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 38px;
  padding: 0 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface-2);
  color: var(--text);
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}
.storage-actions button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.storage-actions .danger-action {
  border-color: color-mix(in srgb, var(--red) 40%, var(--line));
  color: var(--red);
}
.storage-note {
  margin-top: 12px;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
@media (max-width: 600px) {
  .storage-metrics {
    grid-template-columns: 1fr;
  }
  .storage-metric {
    padding: 12px;
  }
  .storage-metric strong {
    font-size: 19px;
  }
  .retention-setting {
    align-items: flex-start;
    flex-direction: column;
  }
  .retention-control,
  .retention-control select {
    width: 100%;
  }
  .storage-actions {
    display: grid;
    grid-template-columns: 1fr;
  }
}
</style>
