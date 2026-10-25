import { computed, reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import {
  api,
  type DomainEvent,
  type NotificationChannel,
  type NotificationDelivery,
  type NotificationEventDefinition,
  type NotificationRule,
  type WebhookConfig,
} from "@/api/client";
import type { AppSelectOption } from "@/components/AppSelect.vue";
import { useToast } from "@/composables/useToast";
import { createAdminSettingsValidators } from "@/utils/admin-settings-validation";
import { useNotificationLabels } from "./useNotificationLabels";

export type NotificationTab = "channels" | "rules" | "history";
export type DeliveryStatusFilter = NotificationDelivery["status"] | "all";

interface ChannelDraft {
  name: string;
  enabled: boolean;
  config: WebhookConfig;
}

interface RuleDraft {
  name: string;
  enabled: boolean;
  eventType: NotificationRule["eventType"];
  phase: NotificationRule["phase"];
  outcome: NotificationRule["outcome"];
  channelIds: string[];
  subjectType: string;
}

export function emptyConfig(): WebhookConfig {
  return {
    provider: "dingtalk",
    url: "",
    method: "POST",
    headers: "",
    body: "",
    dingTalkSecret: "",
    dingTalkMessageType: "text",
    testBody: "",
    messageTemplate: "",
    testMessageTemplate: "",
  };
}

/** 旧版本把内置默认值预填进输入框并随频道保存；这些值与留空语义等价（发送时服务端回退内置默认），读取时统一显示为空，由 placeholder 接管展示。 */
export function normalizeLoadedConfig(config: WebhookConfig): WebhookConfig {
  const next = { ...config };
  if (next.headers.trim() === "{}") next.headers = "";
  if (next.testBody.trim() === '{"event":"{{event}}","status":"{{status}}","message":"{{message}}"}')
    next.testBody = "";
  if (next.messageTemplate === "{{event}}\\n{{status}}\\n{{message}}") next.messageTemplate = "";
  if (next.testMessageTemplate === "PacPilot test") next.testMessageTemplate = "";
  return next;
}

/**
 * State machine for the notification workspace: list loading, channel/rule
 * drafts, delivery filtering and the CRUD/retry actions. Extracted from the
 * 1,8k-line NotificationsView so the view only composes panels, and so the
 * same state can be handed to feature components as a single typed object.
 */
export function useNotificationWorkspace() {
  const { t } = useI18n();
  const router = useRouter();
  const { notify } = useToast();
  const labels = useNotificationLabels();
  const { validateWebhookDraft, webhookErrorMessages } = createAdminSettingsValidators(t);

  const loading = ref(true);
  const error = ref("");
  const tab = ref<NotificationTab>("channels");
  const channels = ref<NotificationChannel[]>([]);
  const rules = ref<NotificationRule[]>([]);
  const events = ref<DomainEvent[]>([]);
  const deliveries = ref<NotificationDelivery[]>([]);
  const catalog = ref<NotificationEventDefinition[]>([]);
  const cid = ref("");
  const rid = ref("");
  const channelEditorOpen = ref(false);
  const ruleEditorOpen = ref(false);
  const busy = ref(false);
  const testingId = ref("");
  const deliveryFilter = ref<DeliveryStatusFilter>("all");
  const showSecret = ref(false);
  const selectedDelivery = ref<NotificationDelivery | null>(null);
  const deliveryDetailOpen = ref(false);

  const ch = reactive<ChannelDraft>({ name: "", enabled: true, config: emptyConfig() });
  const rule = reactive<RuleDraft>({
    name: "",
    enabled: true,
    eventType: "task.execution",
    phase: "finished",
    outcome: "failure",
    channelIds: [],
    subjectType: "",
  });

  // Started/progress phases have no final result, so the outcome filter is
  // meaningless there; the backend rejects it, keep the draft consistent.
  watch(
    () => rule.phase,
    (phase) => {
      if (phase === "started" || phase === "progress") rule.outcome = "any";
    }
  );

  const phases = computed(() => catalog.value.find((x) => x.type === rule.eventType)?.phases ?? []);
  const outcomes = computed(
    () => catalog.value.find((x) => x.type === rule.eventType)?.outcomes ?? []
  );
  const enabledChannels = computed(() => channels.value.filter((x) => x.enabled));
  const enabledRules = computed(() => rules.value.filter((x) => x.enabled));
  const failedDeliveries = computed(() => deliveries.value.filter((x) => x.status === "failed"));
  const pendingDeliveries = computed(() =>
    deliveries.value.filter((x) => x.status === "pending" || x.status === "sending")
  );
  const filteredDeliveries = computed(() =>
    deliveryFilter.value === "all"
      ? deliveries.value
      : deliveries.value.filter((x) => x.status === deliveryFilter.value)
  );
  const channelReady = computed(
    () =>
      Boolean(ch.config.url.trim()) &&
      (ch.config.provider !== "dingtalk" ||
        Boolean(ch.config.dingTalkSecret.trim()) ||
        Boolean(cid.value && channels.value.find((x) => x.id === cid.value)?.hasSecret))
  );
  /** 保存前的前端校验：与服务端一致地拦截非法 URL、JSON 与钉钉配置。 */
  const channelErrors = computed(() =>
    webhookErrorMessages(validateWebhookDraft(ch.config, t("notifications.channelKickerEdit")))
  );
  const phaseDescription = computed(() => {
    switch (rule.phase) {
      case "started":
        return t("notifications.phaseDescStarted");
      case "finished":
        return t("notifications.phaseDescFinished");
      case "state_changed":
        return t("notifications.phaseDescStateChanged");
      default:
        return t("notifications.phaseDescProgress");
    }
  });

  const providerOptions = computed<AppSelectOption[]>(() => [
    { value: "dingtalk", label: t("notifications.providerDingTalk") },
    { value: "custom", label: t("notifications.providerHttp") },
  ]);
  const messageTypeOptions = computed<AppSelectOption[]>(() => [
    { value: "text", label: t("notifications.messageTypeText") },
    { value: "markdown", label: "Markdown" },
  ]);
  const methodOptions: AppSelectOption[] = [
    { value: "POST", label: "POST" },
    { value: "PUT", label: "PUT" },
    { value: "PATCH", label: "PATCH" },
  ];
  const eventOptions = computed<AppSelectOption[]>(() =>
    catalog.value.map((item) => ({
      value: item.type,
      label: labels.evName(item.type, catalog.value),
    }))
  );
  const phaseOptions = computed<AppSelectOption[]>(() =>
    phases.value.map((item) => ({ value: item, label: labels.phaseName(item) }))
  );
  const outcomeOptions = computed<AppSelectOption[]>(() => [
    { value: "any", label: t("notifications.outcomeAnyOption") },
    ...outcomes.value.map((item) => ({ value: item, label: labels.outcomeName(item) })),
  ]);
  const statusFilterOptions = computed<AppSelectOption[]>(() => [
    { value: "all", label: t("notifications.filterAll") },
    { value: "succeeded", label: t("notifications.deliverySucceeded") },
    { value: "pending", label: t("notifications.deliveryPending") },
    { value: "sending", label: t("notifications.deliverySending") },
    { value: "failed", label: t("notifications.deliveryFailed") },
  ]);

  const channelName = (id: string) => channels.value.find((x) => x.id === id)?.name ?? id;
  const ruleNameById = (id: string) => rules.value.find((r) => r.id === id)?.name ?? id;
  const deliveryEvent = (item: NotificationDelivery) =>
    events.value.find((e) => e.id === item.eventId);
  const deliveryEventLabel = (item: NotificationDelivery) => {
    const event = deliveryEvent(item);
    return event ? labels.evName(event.type, catalog.value) : "—";
  };

  function setProvider(value: string | number): void {
    ch.config.provider = String(value) as WebhookConfig["provider"];
  }
  function setMessageType(value: string | number): void {
    ch.config.dingTalkMessageType = String(value) as WebhookConfig["dingTalkMessageType"];
  }
  function setMethod(value: string | number): void {
    ch.config.method = String(value) as WebhookConfig["method"];
  }
  function setPhase(value: string | number): void {
    rule.phase = String(value) as NotificationRule["phase"];
  }
  function setOutcome(value: string | number): void {
    rule.outcome = String(value) as NotificationRule["outcome"];
  }
  function setEvent(value: string): void {
    rule.eventType = value as NotificationRule["eventType"];
    if (!phases.value.includes(rule.phase)) rule.phase = phases.value[0] ?? "finished";
    if (rule.outcome !== "any" && rule.outcome !== null && !outcomes.value.includes(rule.outcome))
      rule.outcome = "any";
  }
  function toggleChannel(id: string, checked: boolean): void {
    const next = new Set(rule.channelIds);
    if (checked) next.add(id);
    else next.delete(id);
    rule.channelIds = [...next];
  }
  function setDeliveryFilter(value: string | number): void {
    deliveryFilter.value = String(value) as DeliveryStatusFilter;
  }

  function openDeliveryDetails(item: NotificationDelivery) {
    selectedDelivery.value = item;
    deliveryDetailOpen.value = true;
  }
  // Keep the open dialog in sync after a retry refreshes the delivery list.
  watch(deliveries, (list) => {
    if (!selectedDelivery.value) return;
    const next = list.find((item) => item.id === selectedDelivery.value?.id);
    if (next) selectedDelivery.value = next;
  });

  async function load(options: { preserveView?: boolean } = {}) {
    const preserveView = options.preserveView ?? false;
    // Background refreshes after save/delete must not swap the editor for the
    // loading panel; doing so changes document height and makes the page jump.
    if (!preserveView) loading.value = true;
    error.value = "";
    try {
      if (!(await api.session()).loggedIn) {
        await router.replace("/admin/login");
        return;
      }
      const result = await api.notifications();
      channels.value = result.channels;
      rules.value = result.rules;
      events.value = [...result.events].reverse();
      deliveries.value = [...result.deliveries].reverse();
      catalog.value = result.eventCatalog;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      if (!preserveView) loading.value = false;
    }
  }

  function resetC() {
    channelEditorOpen.value = true;
    cid.value = "";
    showSecret.value = false;
    Object.assign(ch, { name: "", enabled: true, config: emptyConfig() });
  }
  function editC(item: NotificationChannel) {
    channelEditorOpen.value = true;
    cid.value = item.id;
    showSecret.value = false;
    Object.assign(ch, {
      name: item.name,
      enabled: item.enabled,
      config: normalizeLoadedConfig(item.config),
    });
  }
  async function saveC() {
    if (channelErrors.value.length) {
      notify(channelErrors.value.join(" "), "error");
      return;
    }
    busy.value = true;
    try {
      const payload = { name: ch.name.trim(), enabled: ch.enabled, config: { ...ch.config } };
      const saved = cid.value
        ? await api.updateNotificationChannel(cid.value, payload)
        : await api.createNotificationChannel(payload);
      await load({ preserveView: true });
      editC(saved);
      notify(t("notifications.toastChannelSaved"), "success");
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), "error");
    } finally {
      busy.value = false;
    }
  }
  async function deleteC(item?: NotificationChannel) {
    if (!item) return;
    if (!confirm(t("notifications.confirmDeleteChannel", { name: item.name }))) return;
    try {
      await api.deleteNotificationChannel(item.id);
      if (cid.value === item.id) resetC();
      await load({ preserveView: true });
      notify(t("notifications.toastChannelDeleted"), "success");
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), "error");
    }
  }
  async function testC(item?: NotificationChannel) {
    if (!item) return;
    testingId.value = item.id;
    try {
      const result = await api.testNotificationChannel(item.id);
      notify(
        result.success ? t("notifications.toastTestAccepted") : result.message,
        result.success ? "success" : "error"
      );
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), "error");
    } finally {
      testingId.value = "";
    }
  }

  function resetR() {
    ruleEditorOpen.value = true;
    rid.value = "";
    Object.assign(rule, {
      name: "",
      enabled: true,
      eventType: "task.execution",
      phase: "finished",
      outcome: "failure",
      channelIds: [],
      subjectType: "",
    });
  }
  function editR(item: NotificationRule) {
    ruleEditorOpen.value = true;
    rid.value = item.id;
    Object.assign(rule, {
      name: item.name,
      enabled: item.enabled,
      eventType: item.eventType,
      phase: item.phase,
      outcome: item.outcome ?? "any",
      channelIds: [...item.channelIds],
      subjectType: item.subjectType ?? "",
    });
  }
  async function saveR() {
    busy.value = true;
    try {
      const payload = {
        ...rule,
        name: rule.name.trim(),
        subjectType: rule.subjectType.trim() || undefined,
      };
      const saved = rid.value
        ? await api.updateNotificationRule(rid.value, payload)
        : await api.createNotificationRule(payload);
      await load({ preserveView: true });
      editR(saved);
      notify(t("notifications.toastRuleSaved"), "success");
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), "error");
    } finally {
      busy.value = false;
    }
  }
  async function deleteR(item?: NotificationRule) {
    if (!item) return;
    if (!confirm(t("notifications.confirmDeleteRule", { name: item.name }))) return;
    try {
      await api.deleteNotificationRule(item.id);
      if (rid.value === item.id) resetR();
      await load({ preserveView: true });
      notify(t("notifications.toastRuleDeleted"), "success");
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), "error");
    }
  }
  async function retry(id: string) {
    try {
      await api.retryNotificationDelivery(id);
      await load({ preserveView: true });
      notify(t("notifications.toastRetried"), "success");
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), "error");
    }
  }

  return {
    ...labels,
    loading,
    error,
    tab,
    channels,
    rules,
    events,
    deliveries,
    catalog,
    cid,
    rid,
    channelEditorOpen,
    ruleEditorOpen,
    busy,
    testingId,
    deliveryFilter,
    showSecret,
    selectedDelivery,
    deliveryDetailOpen,
    ch,
    rule,
    phases,
    outcomes,
    enabledChannels,
    enabledRules,
    failedDeliveries,
    pendingDeliveries,
    filteredDeliveries,
    channelReady,
    channelErrors,
    phaseDescription,
    providerOptions,
    messageTypeOptions,
    methodOptions,
    eventOptions,
    phaseOptions,
    outcomeOptions,
    statusFilterOptions,
    channelName,
    ruleNameById,
    deliveryEvent,
    deliveryEventLabel,
    setProvider,
    setMessageType,
    setMethod,
    setPhase,
    setOutcome,
    setEvent,
    toggleChannel,
    setDeliveryFilter,
    openDeliveryDetails,
    load,
    resetC,
    editC,
    saveC,
    deleteC,
    testC,
    resetR,
    editR,
    saveR,
    deleteR,
    retry,
  };
}

export type NotificationWorkspace = ReturnType<typeof useNotificationWorkspace>;
