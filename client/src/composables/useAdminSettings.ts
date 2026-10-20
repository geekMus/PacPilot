import { onMounted, reactive, ref, computed, nextTick, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter, useRoute } from "vue-router";
import {
  api,
  ApiError,
  type AppSettings,
  type GenerationLog,
  type GenpacProbe,
  type WebhookConfig,
} from "../api/client";
import { analyzeDomainRules } from "../utils/domain-rules";
import { commonTimeZones, isValidTimeZone } from "../utils/time-zones";
import { useToast } from "../composables/useToast";
import cronstrue from "cronstrue";
import { CronExpressionParser } from "cron-parser";
import "cronstrue/locales/zh_CN";

export function useAdminSettings() {
  const { t, tm, locale } = useI18n();

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

  const timezoneMenuOpen = ref(false);

  const timezoneQuery = ref("");

  const mobileTimezoneOpen = ref(false);

  const passwordSaving = ref(false);

  const passwordErrorKey = ref<
    | "settings.enterCurrentPassword"
    | "settings.passwordMismatch"
    | "settings.passwordSameAsCurrent"
    | "settings.currentPasswordIncorrect"
    | "settings.newPasswordEmpty"
    | ""
  >("");
  const passwordErrorDetail = ref("");
  const passwordError = computed({
    get: () => (passwordErrorKey.value ? t(passwordErrorKey.value) : passwordErrorDetail.value),
    set: (message: string) => {
      passwordErrorKey.value = "";
      passwordErrorDetail.value = message;
    },
  });
  function passwordErrorKeyFromCode(code: string): typeof passwordErrorKey.value {
    switch (code) {
      case "current_password_incorrect":
        return "settings.currentPasswordIncorrect";
      case "new_password_empty":
        return "settings.newPasswordEmpty";
      case "new_password_same_as_current":
        return "settings.passwordSameAsCurrent";
      default:
        return "";
    }
  }
  function passwordErrorKeyFromMessage(message: string): typeof passwordErrorKey.value {
    switch (message) {
      case "当前管理密码不正确。":
        return "settings.currentPasswordIncorrect";
      case "新密码不能为空。":
        return "settings.newPasswordEmpty";
      case "新密码不能与当前密码相同。":
        return "settings.passwordSameAsCurrent";
      default:
        return "";
    }
  }

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
    proxyTestUrl: "https://www.google.com/generate_204",
    logRetentionDays: 30,
    webhookSuccessConfig: defaultWebhookConfig(),
    webhookFailureConfig: defaultWebhookConfig(),
  });

  function generationLogText(entry: GenerationLog): string {
    return entry.success
      ? t(`gen.success.${entry.result_code}`, entry.detail)
      : entry.error || t("common.failed");
  }

  function generationLogDate(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString(locale.value === "en_US" ? "en-US" : "zh-CN", {
      timeZone: form.timezone,
    });
  }

  function generationModeLabel(mode: string): string {
    return mode === "remote" ? t("workflow.remoteMode") : t("workflow.customMode");
  }

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
      messageTemplate: String(tm("settings.defaultMessageTemplate")),
      testMessageTemplate: String(tm("settings.testMessageTemplate")),
    };
  }

  function normalizedWebhookConfig(value: WebhookConfig | undefined): WebhookConfig {
    return {
      ...defaultWebhookConfig(),
      ...value,
      testBody: value?.testBody ?? defaultWebhookConfig().testBody,
      messageTemplate: value?.messageTemplate?.trim()
        ? value.messageTemplate
        : defaultWebhookConfig().messageTemplate,
      testMessageTemplate: value?.testMessageTemplate?.trim()
        ? value.testMessageTemplate
        : defaultWebhookConfig().testMessageTemplate,
    };
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
    form.mode === "custom" ? t("settings.modeCustomHint") : t("settings.modeRemoteHint")
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
    if (cronParse.value.error)
      return t("settings.cronInvalidMsg", { error: cronParse.value.error });
    return t("settings.cronPlanMsg", {
      description: cronParse.value.description,
      timezone: form.timezone,
    });
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
      if (testBodyError)
        errors.testBody = t("settings.webhookTestBodyError", { label, error: testBodyError });
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
                errors.headers = label + t("settings.headersTransport");
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
        if (!looksLikeUrl(config.url.trim())) errors.url = t("settings.dingTalkUrl", { label });
        else if (!new URL(config.url.trim()).searchParams.has("access_token"))
          errors.url = t("settings.dingTalkToken", { label });
        if (!config.dingTalkSecret.trim()) errors.secret = t("settings.dingTalkSecret", { label });
      } else if (config.dingTalkSecret.trim())
        errors.url = t("settings.dingTalkSecretNeedsUrl", { label });
    }
    return errors;
  }

  function webhookErrorMessages(errors: WebhookFieldErrors): string[] {
    return [errors.url, errors.headers, errors.body, errors.testBody, errors.secret].filter(
      Boolean
    );
  }

  function validDomainOrIPv4(host: string): boolean {
    if (!host || host.length > 253) return false;
    const ipv4Like = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host);
    if (ipv4Like) {
      return host
        .split(".")
        .every((part) => /^(0|[1-9]\d{0,2})$/.test(part) && Number(part) <= 255);
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
    return firstError
      ? t("settings.domainLineError", { label, line: firstError.line, message: firstError.message })
      : null;
  }

  function validateProxyTestUrl(rawValue: string): string | null {
    const value = rawValue.trim();
    if (!value) return t("settings.probeUrlEmpty");
    if (/[\u0000-\u0020\u007f]/.test(value)) return t("settings.probeUrlWhitespace");
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
    if (!looksLikeUrl(form.listUrl.trim())) return t("settings.listUrlInvalid");
    return "";
  });

  const ruleAnalysis = computed(() => analyzeDomainRules(form.directListText, form.blockListText));

  const directRuleDiagnostics = computed(() => ruleAnalysis.value.direct.diagnostics);

  const blockRuleDiagnostics = computed(() => ruleAnalysis.value.block.diagnostics);

  const directListError = computed(() =>
    validateDomainRules(form.directListText, t("settings.directList"))
  );

  const blockListError = computed(() =>
    validateDomainRules(form.blockListText, t("settings.blockList"))
  );

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
    form.proxyTestUrl = s.proxyTestUrl || "https://www.google.com/generate_204";
    form.logRetentionDays = Number.isFinite(s.logRetentionDays) ? s.logRetentionDays : 30;
    form.webhookSuccessConfig = normalizedWebhookConfig(s.webhookSuccessConfig);
    form.webhookFailureConfig = normalizedWebhookConfig(s.webhookFailureConfig);
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
      proxyTestUrl: form.proxyTestUrl.trim(),
      logRetentionDays: form.logRetentionDays,
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
      if (!session.loggedIn) {
        await router.replace("/admin/login");
        return;
      }
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
      validateWebhookDraft(
        config,
        kind === "success" ? t("settings.successChannel") : t("settings.failureChannel")
      )
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
    passwordError.value = "";
    if (!passwordForm.currentPassword) {
      passwordErrorKey.value = "settings.enterCurrentPassword";
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      passwordErrorKey.value = "settings.passwordMismatch";
      return;
    }
    if (passwordForm.newPassword === passwordForm.currentPassword) {
      passwordErrorKey.value = "settings.passwordSameAsCurrent";
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
      const message = e instanceof Error ? e.message : "";
      const key =
        (e instanceof ApiError && passwordErrorKeyFromCode(e.code)) ||
        passwordErrorKeyFromMessage(message);
      if (key) passwordErrorKey.value = key;
      else passwordError.value = message || t("settings.passwordChangeFailed");
    } finally {
      passwordSaving.value = false;
    }
  }

  return {
    t,
    loading,
    saving,
    flash,
    flashOk,
    error,
    logs,
    logHasMore,
    logLoadingMore,
    logLoadError,
    logTotal,
    loadMoreLogs,
    genpacProbe,
    timezoneMenuOpen,
    timezoneQuery,
    mobileTimezoneOpen,
    passwordSaving,
    passwordError,
    passwordForm,
    webhookTestState,
    form,
    generationLogText,
    generationLogDate,
    generationModeLabel,
    commonTimeZones,
    isValidTimeZone,
    filteredTimeZones,
    selectTimeZone,
    closeTimezoneMenu,
    openMobileTimezonePicker,
    modeHint,
    cronPresets,
    cronHint,
    applyCronPreset,
    pacProxyError,
    listUrlError,
    ruleAnalysis,
    directRuleDiagnostics,
    blockRuleDiagnostics,
    directListError,
    blockListError,
    timezoneError,
    cronError,
    webhookValidation,
    formErrors,
    handleFloatingSaveClick,
    canSubmit,
    hasUnsavedSettings,
    saveAndGenerate,
    testWebhook,
    changeAdminPassword,
  };
}
