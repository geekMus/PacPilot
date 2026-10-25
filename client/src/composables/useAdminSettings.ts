import { onMounted, reactive, ref, computed, nextTick, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter, useRoute } from "vue-router";
import { api, type AppSettings, type PacPilotProbe, type WebhookConfig } from "@/api/client";
import { analyzeDomainRules } from "@/utils/domain-rules";
import { DEFAULT_LIST_URL } from "@shared/contracts";
import { createAdminSettingsValidators } from "@/utils/admin-settings-validation";
import { commonTimeZones, isValidTimeZone } from "@/utils/time-zones";
import { useToast } from "@/composables/useToast";

export function useAdminSettings() {
  const { t, locale } = useI18n();

  const { notify } = useToast();

  const { looksLikeUrl, validatePacProxyString, validateDomainRules } =
    createAdminSettingsValidators(t);

  const router = useRouter();

  const route = useRoute();

  const loading = ref(true);

  const saving = ref(false);

  /** 最近一次已知已持久化到服务端的完整配置，是即时保存的比对基准。 */
  const saved = ref<AppSettings | null>(null);

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

  const pacProxyError = computed(() => validatePacProxyString(form.pacProxy));

  const listUrlError = computed(() => {
    if (form.mode !== "remote") return "";
    if (!form.listUrl.trim()) return "";
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

  function splitLines(text: string): string[] {
    return text
      .split(/[\n,]+/)
      .map((x) => x.trim())
      .filter(Boolean);
  }

  /**
   * 逐项即时保存：只提交与已保存配置不同的字段；generate 表示该项影响
   * PAC 内容，需要走「保存并生成」让服务端重建 PAC。任何结果都通过
   * toast 反馈。
   */
  async function tryApply(
    patch: Partial<AppSettings>,
    options: { generate: boolean; message: string; invalid?: string }
  ): Promise<void> {
    if (!saved.value || saving.value) return;
    const current = saved.value as unknown as Record<string, unknown>;
    const diff = Object.fromEntries(
      Object.entries(patch).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(current[key]))
    ) as Partial<AppSettings>;
    if (!Object.keys(diff).length) return;
    if (options.invalid) {
      notify(options.invalid, "warning");
      return;
    }
    saving.value = true;
    try {
      // 合并服务端最新配置，避免覆盖其他页面（通知渠道、日志保留期）的修改。
      const latest = await api.settings();
      form.webhookSuccessConfig = normalizedWebhookConfig(latest.webhookSuccessConfig);
      form.webhookFailureConfig = normalizedWebhookConfig(latest.webhookFailureConfig);
      form.logRetentionDays = latest.logRetentionDays;
      const payload: AppSettings = { ...latest, ...diff };
      if (options.generate) {
        await api.saveAndGenerate(payload);
      } else {
        await api.saveSettings(payload);
      }
      saved.value = payload;
      notify(options.message, "success");
      if (options.generate) {
        // 探针刷新只是辅助操作，不影响已成功的保存结果。
        const latestProbe = await api.pacpilotStatus().catch(() => null);
        if (latestProbe) pacpilotProbe.value = latestProbe;
      }
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), "error");
    } finally {
      saving.value = false;
    }
  }

  function onTimeZoneSelected(value: string) {
    const changed = value !== form.timezone;
    selectTimeZone(value);
    if (changed) {
      void tryApply(
        { timezone: value.trim() },
        { generate: false, message: t("settings.savedTimeZone"), invalid: timezoneError.value }
      );
    }
  }

  function onTimeZoneChip(value: string) {
    if (form.timezone === value) return;
    form.timezone = value;
    void tryApply(
      { timezone: value },
      { generate: false, message: t("settings.savedTimeZone"), invalid: timezoneError.value }
    );
  }

  function onModeChange(value: string) {
    const mode = value as "custom" | "remote";
    if (form.mode === mode) return;
    form.mode = mode;
  }

  function saveMode() {
    void tryApply({ mode: form.mode }, { generate: true, message: t("settings.savedMode") });
  }

  function onPacProxyCommit() {
    void tryApply(
      { pacProxy: form.pacProxy.trim() },
      { generate: true, message: t("settings.savedPacProxy"), invalid: pacProxyError.value ?? undefined }
    );
  }

  function onListUrlCommit() {
    if (form.mode !== "remote") return;
    const url = form.listUrl.trim() || DEFAULT_LIST_URL;
    void tryApply(
      { listUrl: url },
      { generate: true, message: t("settings.savedListUrl"), invalid: listUrlError.value }
    );
  }

  function onPacCompressToggle(checked: boolean) {
    if (form.pacCompress === checked) return;
    form.pacCompress = checked;
    void tryApply({ pacCompress: checked }, { generate: true, message: t("settings.savedPacCompress") });
  }

  /** 等待进行中的 cron 解析结束再校验提交，避免误报格式错误。 */
  async function waitCronParsing(): Promise<void> {
    const deadline = Date.now() + 800;
    while (cronParsing.value && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  async function onCronCommit() {
    await waitCronParsing();
    void tryApply(
      { cronSchedule: form.cronSchedule.trim() },
      { generate: false, message: t("settings.savedCron"), invalid: cronError.value }
    );
  }

  function applyCronPreset(value: string) {
    if (form.cronSchedule.trim() === value) return;
    form.cronSchedule = value;
    void onCronCommit();
  }

  const ruleErrors = computed(() => directListError.value || blockListError.value);

  const hasUnsavedRules = computed(() => {
    if (!saved.value) return false;
    const current = JSON.stringify({
      directList: splitLines(form.directListText),
      blockList: splitLines(form.blockListText),
    });
    const persisted = JSON.stringify({
      directList: saved.value.directList,
      blockList: saved.value.blockList,
    });
    return current !== persisted;
  });

  const hasUnsavedMode = computed(() => {
    if (!saved.value) return false;
    return form.mode !== saved.value.mode;
  });

  function saveRules() {
    if (ruleErrors.value) {
      notify(ruleErrors.value, "warning");
      return;
    }
    void tryApply(
      { directList: splitLines(form.directListText), blockList: splitLines(form.blockListText) },
      { generate: true, message: t("settings.savedRules") }
    );
  }

  function applySettings(s: AppSettings) {
    form.mode = s.mode;
    form.pacProxy = s.pacProxy;
    form.pacCompress = s.pacCompress;
    form.listUrl = s.listUrl === DEFAULT_LIST_URL ? "" : s.listUrl;
    form.directListText = s.directList.join("\n");
    form.blockListText = s.blockList.join("\n");
    form.cronSchedule = s.cronSchedule;
    form.timezone = s.timezone || "Asia/Shanghai";
    form.logRetentionDays = Number.isFinite(s.logRetentionDays) ? s.logRetentionDays : 30;
    form.webhookSuccessConfig = normalizedWebhookConfig(s.webhookSuccessConfig);
    form.webhookFailureConfig = normalizedWebhookConfig(s.webhookFailureConfig);
  }

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
        api.pacpilotStatus().catch((): PacPilotProbe => ({
          available: false,
          command: null,
          detail: t("settings.engineUnknown"),
        })),
      ]);
      applySettings(settings);
      saved.value = settings;
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

  return {
    t,
    loading,
    saving,
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
    onTimeZoneSelected,
    onTimeZoneChip,
    modeHint,
    cronPresets,
    cronHint,
    onCronCommit,
    applyCronPreset,
    onModeChange,
    saveMode,
    onPacProxyCommit,
    onListUrlCommit,
    onPacCompressToggle,
    pacProxyError,
    listUrlError,
    ruleAnalysis,
    directRuleDiagnostics,
    blockRuleDiagnostics,
    directListError,
    blockListError,
    ruleErrors,
    hasUnsavedRules,
    hasUnsavedMode,
    saveRules,
    timezoneError,
    cronError,
  };
}
