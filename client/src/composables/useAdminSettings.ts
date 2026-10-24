import { onMounted, reactive, ref, computed, nextTick, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter, useRoute } from "vue-router";
import {
  api,
  type AppSettings,
  type PacPilotProbe,
  type WebhookConfig,
} from "@/api/client";
import { analyzeDomainRules } from "@/utils/domain-rules";
import { DEFAULT_LIST_URL } from "@shared/contracts";
import { createAdminSettingsValidators } from "@/utils/admin-settings-validation";
import { commonTimeZones, isValidTimeZone } from "@/utils/time-zones";
import { useToast } from "@/composables/useToast";

export function useAdminSettings() {
  const { t, locale } = useI18n();

  const { notify } = useToast();

  const {
    looksLikeUrl,
    validatePacProxyString,
    validateDomainRules,
  } = createAdminSettingsValidators(t);

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

  const pacpilotProbe = ref<PacPilotProbe | null>(null);

  const timezoneMenuOpen = ref(false);

  const timezoneQuery = ref("");


  const form = reactive({
    mode: "custom" as "custom" | "remote",
    pacProxy: "",
    pacCompress: true,
    listUrl: DEFAULT_LIST_URL,
    directListText: "",
    blockListText: "",
    cronSchedule: "",
    timezone: "Asia/Shanghai",
    logRetentionDays: 30,
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
      messageTemplate: "",
      testMessageTemplate: "",
    };
  }

  function normalizedWebhookConfig(value: WebhookConfig | undefined): WebhookConfig {
    return {
      ...defaultWebhookConfig(),
      ...value,
      testBody: value?.testBody ?? defaultWebhookConfig().testBody,
      messageTemplate: value?.messageTemplate ?? "",
      testMessageTemplate: value?.testMessageTemplate ?? "",
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
  }

  function closeTimezoneMenu() {
    window.setTimeout(() => {
      timezoneMenuOpen.value = false;
    }, 140);
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

  const cronParse = ref({ description: "", error: "" });
  const cronParsing = ref(false);
  let cronParseRequest = 0;

  /** Load cron-parser and cronstrue only when a non-empty cron expression needs validation. */
  async function refreshCronParse(expr: string): Promise<void> {
    const request = ++cronParseRequest;
    const value = expr.trim();
    if (!value) {
      cronParse.value = { description: "", error: "" };
      cronParsing.value = false;
      return;
    }
    if (value.split(/\s+/).length !== 5) {
      cronParse.value = { description: "", error: t("settings.cronFormatError") };
      cronParsing.value = false;
      return;
    }

    cronParsing.value = true;
    try {
      const [parserModule, cronstrueModule] = await Promise.all([
        import("cron-parser"),
        import("cronstrue"),
      ]);
      if (request !== cronParseRequest) return;

      const isEnglish = locale.value === "en_US";
      if (!isEnglish) {
        await import("cronstrue/locales/zh_CN");
      }
      if (request !== cronParseRequest) return;

      parserModule.CronExpressionParser.parse(value);
      cronParse.value = {
        description: cronstrueModule.default.toString(value, {
          locale: isEnglish ? "en" : "zh_CN",
          dayOfWeekStartIndexZero: false,
          use24HourTimeFormat: true,
          throwExceptionOnParseError: true,
        }),
        error: "",
      };
    } catch {
      if (request === cronParseRequest) {
        cronParse.value = { description: "", error: t("settings.cronParseError") };
      }
    } finally {
      if (request === cronParseRequest) cronParsing.value = false;
    }
  }

  watch(
    [() => form.cronSchedule, () => locale.value],
    ([expr]) => {
      void refreshCronParse(expr);
    },
    { immediate: true }
  );

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

  /** 保存前统一校验；错误列表为空才允许保存和生成 PAC。 */
  const formErrors = computed(() => {
    const errs: string[] = [];
    if (timezoneError.value) errs.push(timezoneError.value);
    if (pacProxyError.value) errs.push(pacProxyError.value);
    if (listUrlError.value) errs.push(listUrlError.value);
    if (directListError.value) errs.push(directListError.value);
    if (blockListError.value) errs.push(blockListError.value);
    if (cronError.value) errs.push(t("settings.cronInvalid") + cronError.value);
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

  const canSubmit = computed(
    () => formErrors.value.length === 0 && !saving.value && !cronParsing.value
  );

  function applySettings(s: AppSettings) {
    form.mode = s.mode;
    form.pacProxy = s.pacProxy;
    form.pacCompress = s.pacCompress;
    form.listUrl = s.listUrl;
    form.directListText = s.directList.join("\n");
    form.blockListText = s.blockList.join("\n");
    form.cronSchedule = s.cronSchedule;
    form.timezone = s.timezone || "Asia/Shanghai";
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
      const [settings, probe] = await Promise.all([
        api.settings(),
        api.pacpilotStatus().catch(
          (): PacPilotProbe => ({
            available: false,
            command: null,
            detail: t("settings.engineUnknown"),
          })
        ),
      ]);
      applySettings(settings);
      savedSettingsSnapshot.value = settingsSnapshot();
      pacpilotProbe.value = probe;
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
    if (saving.value || cronParsing.value) return;
    flash.value = "";
    error.value = "";
    if (formErrors.value.length) {
      await jumpToFirstError();
      return;
    }
    saving.value = true;
    try {
      // Webhook now has its own service; merge the latest channel settings to avoid overwriting changes from another page.
      const latestSettings = await api.settings();
      form.webhookSuccessConfig = normalizedWebhookConfig(latestSettings.webhookSuccessConfig);
      form.webhookFailureConfig = normalizedWebhookConfig(latestSettings.webhookFailureConfig);
      form.logRetentionDays = latestSettings.logRetentionDays;
      const payload = toPayload();
      const submittedSnapshot = JSON.stringify(payload);
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
      const latestProbe = await api.pacpilotStatus().catch(() => null);
      if (latestProbe) pacpilotProbe.value = latestProbe;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      notify(error.value, "error");
    } finally {
      saving.value = false;
    }
  }

  return {
    t,
    loading,
    saving,
    flash,
    flashOk,
    error,
    pacpilotProbe,
    timezoneMenuOpen,
    timezoneQuery,
    form,
    commonTimeZones,
    isValidTimeZone,
    filteredTimeZones,
    selectTimeZone,
    closeTimezoneMenu,
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
    formErrors,
    handleFloatingSaveClick,
    canSubmit,
    hasUnsavedSettings,
    saveAndGenerate,
  };
}
