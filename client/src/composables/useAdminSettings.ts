import { onMounted, reactive, ref, computed, nextTick, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter, useRoute } from "vue-router";
import { api, type AppSettings, type PacPilotProbe } from "@/api/client";
import { analyzeDomainRules } from "@/utils/domain-rules";
import { DEFAULT_LIST_URL } from "@shared/contracts";
import { createAdminSettingsValidators } from "@/utils/admin-settings-validation";
import { useToast } from "@/composables/useToast";
import { fetchAdminSession } from "@/composables/useAdminSession";

export function useAdminSettings() {
  const { t, locale } = useI18n();

  const { notify } = useToast();

  const { looksLikeUrl, validatePacProxyString, validateDomainRules } =
    createAdminSettingsValidators(t);

  const router = useRouter();

  const route = useRoute();

  const loading = ref(true);

  const saving = ref(false);

  /** 即时保存的串行队列，保证同一时间只有一个请求在途。 */
  let saveQueue: Promise<void> = Promise.resolve();

  /** 最近一次已知已持久化到服务端的完整配置，是即时保存的比对基准。 */
  const saved = ref<AppSettings | null>(null);

  const error = ref("");

  const pacpilotProbe = ref<PacPilotProbe | null>(null);

  const form = reactive({
    mode: "custom" as "custom" | "remote",
    pacProxy: "",
    pacCompress: true,
    pacObfuscate: false,
    listUrl: DEFAULT_LIST_URL,
    directListText: "",
    blockListText: "",
    cronSchedule: "",
    timezone: "Asia/Shanghai",
    logRetentionDays: 30,
  });

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

  const directListError = computed(() => validateDomainRules(form.directListText, "direct"));

  const blockListError = computed(() => validateDomainRules(form.blockListText, "block"));

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
   *
   * 每次保存都排进串行队列。输入框失焦提交和紧随其后的按钮点击会在同一
   * 帧内先后触发保存，并发提交会让两个请求各带一份旧快照，后落地的那个
   * 把先写入的字段改回旧值；排队后 diff 始终基于上一次保存后的 saved 计算。
   */
  async function tryApply(
    patch: Partial<AppSettings>,
    options: { generate: boolean; message: string; invalid?: string }
  ): Promise<void> {
    const run = async (): Promise<void> => {
      if (!saved.value) return;
      const current = saved.value as unknown as Record<string, unknown>;
      const diff = Object.fromEntries(
        Object.entries(patch).filter(
          ([key, value]) => JSON.stringify(value) !== JSON.stringify(current[key])
        )
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
    };
    const next = saveQueue.then(run, run).catch(() => undefined);
    saveQueue = next;
    return next;
  }

  function onModeChange(value: string) {
    const mode = value as "custom" | "remote";
    if (form.mode === mode) return;
    form.mode = mode;
  }

  function saveMode() {
    const patch: Partial<AppSettings> = { mode: form.mode };
    // 远程模式的规则地址为空时提交默认地址：服务端在 remote 模式下要求
    // listUrl 是合法的 HTTP(S) 地址，空串会被判为非法。
    if (form.mode === "remote") {
      patch.listUrl = form.listUrl.trim() || DEFAULT_LIST_URL;
    }
    void tryApply(patch, {
      generate: true,
      message: t("settings.savedMode"),
      invalid: listUrlError.value,
    });
  }

  function onPacProxyCommit() {
    void tryApply(
      { pacProxy: form.pacProxy.trim() },
      {
        generate: true,
        message: t("settings.savedPacProxy"),
        invalid: pacProxyError.value ?? undefined,
      }
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
    void tryApply(
      { pacCompress: checked },
      { generate: true, message: t("settings.savedPacCompress") }
    );
  }

  function onPacObfuscateToggle(checked: boolean) {
    if (form.pacObfuscate === checked) return;
    form.pacObfuscate = checked;
    void tryApply(
      { pacObfuscate: checked },
      { generate: true, message: t("settings.savedPacObfuscate") }
    );
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
    form.pacObfuscate = Boolean(s.pacObfuscate);
    form.listUrl = s.listUrl === DEFAULT_LIST_URL ? "" : s.listUrl;
    form.directListText = s.directList.join("\n");
    form.blockListText = s.blockList.join("\n");
    form.cronSchedule = s.cronSchedule;
    form.timezone = s.timezone || "Asia/Shanghai";
    form.logRetentionDays = Number.isFinite(s.logRetentionDays) ? s.logRetentionDays : 30;
  }

  async function load() {
    loading.value = true;
    error.value = "";
    try {
      // 复用路由守卫刚做过的会话探测（带短 TTL 缓存），避免首屏再串一次网络往返。
      const session = await fetchAdminSession();
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
    form,
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
    onPacObfuscateToggle,
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
    cronError,
  };
}
