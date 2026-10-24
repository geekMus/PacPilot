<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import AdminLayout from "@/components/layout/AdminLayout.vue";
import AppIcon from "@/components/AppIcon.vue";
import AppFooter from "@/components/AppFooter.vue";
import AppScrollArea from "@/components/AppScrollArea.vue";
import AppDialog from "@/components/AppDialog.vue";
import VirtualTable from "@/components/VirtualTable.vue";
import AppInput from "@/components/AppInput.vue";
import AppSelect, { type AppSelectOption } from "@/components/AppSelect.vue";
import AppToggle from "@/components/AppToggle.vue";
import AppCheckbox from "@/components/AppCheckbox.vue";
import AppButton from "@/components/AppButton.vue";
import AppIconButton from "@/components/AppIconButton.vue";
import CodeMirrorField from "@/components/CodeMirrorField.vue";
import WebhookBodyEditor from "@/features/webhooks/components/WebhookBodyEditor.vue";
import { api, type NotificationChannel, type NotificationRule, type WebhookConfig } from "@/api/client";
import { useToast } from "@/composables/useToast";

type ViewTab = "channels" | "rules" | "history";
const { t, locale } = useI18n();
const router = useRouter();
const { notify } = useToast();
const loading = ref(true);
const error = ref("");
const tab = ref<ViewTab>("channels");
const channels = ref<NotificationChannel[]>([]);
const rules = ref<NotificationRule[]>([]);
const events = ref<any[]>([]);
const deliveries = ref<any[]>([]);
const catalog = ref<any[]>([]);
const cid = ref("");
const rid = ref("");
const channelEditorOpen = ref(false);
const ruleEditorOpen = ref(false);
const busy = ref(false);
const testingId = ref("");
const deliveryFilter = ref("all");
const showSecret = ref(false);
const selectedDelivery = ref<any | null>(null);
const deliveryDetailOpen = ref(false);

const config = (): WebhookConfig => ({
  provider: "dingtalk",
  url: "",
  method: "POST",
  headers: "{}",
  body: "",
  dingTalkSecret: "",
  dingTalkMessageType: "text",
  testBody: '{"event":"{{event}}","status":"{{status}}","message":"{{message}}"}',
  messageTemplate: "{{event}}\\n{{status}}\\n{{message}}",
  testMessageTemplate: "PacPilot test",
});
const ch = reactive({ name: "", enabled: true, config: config() });
const rule = reactive({
  name: "",
  enabled: true,
  eventType: "task.execution" as NotificationRule["eventType"],
  phase: "finished" as NotificationRule["phase"],
  outcome: "failure" as NotificationRule["outcome"],
  channelIds: [] as string[],
  subjectType: "",
});

watch(() => rule.phase, (phase) => {
  if (phase === "started" || phase === "progress") rule.outcome = "any";
});
const phases = computed(() => catalog.value.find((x) => x.type === rule.eventType)?.phases ?? []);
const outcomes = computed(() => catalog.value.find((x) => x.type === rule.eventType)?.outcomes ?? []);
const enabledChannels = computed(() => channels.value.filter((x) => x.enabled));
const enabledRules = computed(() => rules.value.filter((x) => x.enabled));
const failedDeliveries = computed(() => deliveries.value.filter((x) => x.status === "failed"));
const pendingDeliveries = computed(() => deliveries.value.filter((x) => x.status === "pending" || x.status === "sending"));
const filteredDeliveries = computed(() => deliveryFilter.value === "all" ? deliveries.value : deliveries.value.filter((x) => x.status === deliveryFilter.value));
const channelReady = computed(() => Boolean(ch.config.url.trim()) && (ch.config.provider !== "dingtalk" || Boolean(ch.config.dingTalkSecret.trim()) || Boolean(cid.value && channels.value.find((x) => x.id === cid.value)?.hasSecret)));
const evName = (v: string) => {
  switch (v) {
    case "task.execution": return t("notifications.eventTaskExecution");
    case "config.publish": return t("notifications.eventConfigPublish");
    case "request.process": return t("notifications.eventRequestProcess");
    case "system.error": return t("notifications.eventSystemError");
    default: return catalog.value.find((x) => x.type === v)?.label ?? v;
  }
};
const phaseName = (v: string) => {
  switch (v) {
    case "started": return t("notifications.phaseStarted");
    case "finished": return t("notifications.phaseFinished");
    case "state_changed": return t("notifications.phaseStateChanged");
    case "progress": return t("notifications.phaseProgress");
    default: return v;
  }
};
const outcomeName = (v?: string | null) => {
  switch (v ?? "any") {
    case "success": return t("notifications.outcomeSuccess");
    case "failure": return t("notifications.outcomeFailure");
    case "cancelled": return t("notifications.outcomeCancelled");
    case "timeout": return t("notifications.outcomeTimeout");
    case "unknown": return t("notifications.outcomeUnknown");
    default: return t("notifications.outcomeAny");
  }
};
const channelName = (id: string) => channels.value.find((x) => x.id === id)?.name ?? id;
const providerName = (provider: string) => provider === "dingtalk" ? t("notifications.providerDingTalk") : t("notifications.providerHttp");
const statusName = (status: string) => {
  switch (status) {
    case "succeeded": return t("notifications.deliverySucceeded");
    case "pending": return t("notifications.deliveryPending");
    case "sending": return t("notifications.deliverySending");
    case "failed": return t("notifications.deliveryFailed");
    default: return status;
  }
};
const statusIcon = (status: string): "circle-check" | "clock" | "loader-circle" | "circle-alert" => ({ succeeded: "circle-check", pending: "clock", sending: "loader-circle", failed: "circle-alert" } as Record<string, "circle-check" | "clock" | "loader-circle" | "circle-alert">)[status] ?? "clock";
const formatDate = (value?: string) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(locale.value === "en_US" ? "en-US" : "zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(date);
};
const shortUrl = (value: string) => value.replace(/^https?:\/\//, "").replace(/\?.*$/, "");
const phaseDescription = computed(() => {
  switch (rule.phase) {
    case "started": return t("notifications.phaseDescStarted");
    case "finished": return t("notifications.phaseDescFinished");
    case "state_changed": return t("notifications.phaseDescStateChanged");
    default: return t("notifications.phaseDescProgress");
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
  catalog.value.map((item) => ({ value: item.type, label: evName(item.type) }))
);
const phaseOptions = computed<AppSelectOption[]>(() =>
  (phases.value as string[]).map((item: string) => ({ value: item, label: phaseName(item) }))
);
const outcomeOptions = computed<AppSelectOption[]>(() => [
  { value: "any", label: t("notifications.outcomeAnyOption") },
  ...(outcomes.value as string[]).map((item: string) => ({ value: item, label: outcomeName(item) })),
]);
const statusFilterOptions = computed<AppSelectOption[]>(() => [
  { value: "all", label: t("notifications.filterAll") },
  { value: "succeeded", label: t("notifications.deliverySucceeded") },
  { value: "pending", label: t("notifications.deliveryPending") },
  { value: "sending", label: t("notifications.deliverySending") },
  { value: "failed", label: t("notifications.deliveryFailed") },
]);

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
function toggleChannel(id: string, checked: boolean): void {
  const next = new Set(rule.channelIds);
  if (checked) next.add(id);
  else next.delete(id);
  rule.channelIds = [...next];
}

const deliveryEvent = (item: any) => events.value.find((e) => e.id === item.eventId);const deliveryEventLabel = (item: any) => {
  const event = deliveryEvent(item);
  return event ? evName(event.type) : "—";
};
const ruleNameById = (id: string) => rules.value.find((r) => r.id === id)?.name ?? id;
function openDeliveryDetails(item: any) {
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
  Object.assign(ch, { name: "", enabled: true, config: config() });
}
function editC(item: NotificationChannel) {
  channelEditorOpen.value = true;
  cid.value = item.id;
  showSecret.value = false;
  Object.assign(ch, { name: item.name, enabled: item.enabled, config: { ...item.config } });
}
async function saveC() {
  busy.value = true;
  try {
    const payload = { name: ch.name.trim(), enabled: ch.enabled, config: { ...ch.config } };
    const saved = cid.value ? await api.updateNotificationChannel(cid.value, payload) : await api.createNotificationChannel(payload);
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
    notify(result.success ? t("notifications.toastTestAccepted") : result.message, result.success ? "success" : "error");
  } catch (e) {
    notify(e instanceof Error ? e.message : String(e), "error");
  } finally {
    testingId.value = "";
  }
}
function resetR() {
  ruleEditorOpen.value = true;
  rid.value = "";
  Object.assign(rule, { name: "", enabled: true, eventType: "task.execution", phase: "finished", outcome: "failure", channelIds: [], subjectType: "" });
}
function editR(item: NotificationRule) {
  ruleEditorOpen.value = true;
  rid.value = item.id;
  Object.assign(rule, { name: item.name, enabled: item.enabled, eventType: item.eventType, phase: item.phase, outcome: item.outcome ?? "any", channelIds: [...item.channelIds], subjectType: item.subjectType ?? "" });
}
function setEvent(value: string) {
  rule.eventType = value as NotificationRule["eventType"];
  if (!phases.value.includes(rule.phase)) rule.phase = phases.value[0] ?? "finished";
  if (rule.outcome !== "any" && !outcomes.value.includes(rule.outcome as never)) rule.outcome = "any";
}
async function saveR() {
  busy.value = true;
  try {
    const payload = { ...rule, name: rule.name.trim(), subjectType: rule.subjectType.trim() || undefined };
    const saved = rid.value ? await api.updateNotificationRule(rid.value, payload) : await api.createNotificationRule(payload);
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
onMounted(() => {
  void load();
});
</script>

<template>
  <AdminLayout active="notifications" :title="t('nav.notifications')" :subtitle="t('notifications.subtitle')">
    <main class="webhook-page">
      <section class="page-intro">
        <div class="intro-copy">
          <div class="eyebrow"><AppIcon name="workflow" :size="14" /> {{ t("notifications.eventDriven") }}</div>
          <h2>{{ t("notifications.workspace") }}</h2>
          <p>{{ t("notifications.workspaceHint") }}</p>
        </div>
        <div class="intro-state">
          <span class="state-dot" :class="{ online: enabledChannels.length > 0 && enabledRules.length > 0 }"></span>
          <div><strong>{{ enabledChannels.length && enabledRules.length ? t("notifications.stateReady") : t("notifications.stateSetup") }}</strong><small>{{ t("notifications.stateHint") }}</small></div>
        </div>
      </section>

      <section class="overview-grid" :aria-label="t('notifications.workspace')">
        <article class="overview-card">
          <div class="overview-top">
            <span class="overview-icon channel-icon"><AppIcon name="network" :size="18" /></span>
            <div class="overview-value">{{ enabledChannels.length }}<span> / {{ channels.length }}</span></div>
          </div>
          <div class="overview-label">{{ t("notifications.overviewChannels") }}</div>
          <div class="overview-foot">{{ t("notifications.overviewChannelsHint") }}</div>
        </article>
        <article class="overview-card">
          <div class="overview-top">
            <span class="overview-icon rule-icon"><AppIcon name="route" :size="18" /></span>
            <div class="overview-value">{{ enabledRules.length }}<span> / {{ rules.length }}</span></div>
          </div>
          <div class="overview-label">{{ t("notifications.overviewRules") }}</div>
          <div class="overview-foot">{{ t("notifications.overviewRulesHint") }}</div>
        </article>
        <article class="overview-card">
          <div class="overview-top">
            <span class="overview-icon delivery-icon"><AppIcon name="activity" :size="18" /></span>
            <div class="overview-value">{{ pendingDeliveries.length }}</div>
          </div>
          <div class="overview-label">{{ t("notifications.overviewPending") }}</div>
          <div class="overview-foot">{{ t("notifications.overviewPendingHint") }}</div>
        </article>
        <article class="overview-card" :class="{ 'has-failures': failedDeliveries.length > 0 }">
          <div class="overview-top">
            <span class="overview-icon failure-icon"><AppIcon name="circle-alert" :size="18" /></span>
            <div class="overview-value">{{ failedDeliveries.length }}</div>
          </div>
          <div class="overview-label">{{ t("notifications.overviewFailed") }}</div>
          <div class="overview-foot">{{ failedDeliveries.length ? t("notifications.overviewFailedHint") : t("notifications.overviewFailedNone") }}</div>
        </article>
      </section>

      <p v-if="loading" class="state-panel"><AppIcon name="loader-circle" :size="18" class="spin" /> {{ t("notifications.loading") }}</p>
      <section v-else-if="error" class="state-panel state-error">
        <AppIcon name="circle-alert" :size="20" /><div><strong>{{ t("notifications.loadFailed") }}</strong><p>{{ error }}</p></div><AppButton variant="secondary" @click="load()">{{ t("common.retry") }}</AppButton>
      </section>
      <template v-else>
        <section class="workspace-region">
          <nav class="workspace-tabs" :aria-label="t('notifications.workspace')">
            <button :class="{ active: tab === 'channels' }" @click="tab = 'channels'">
              <AppIcon name="network" :size="16" /> {{ t("notifications.tabChannels") }} <span class="tab-count">{{ channels.length }}</span>
            </button>
            <button :class="{ active: tab === 'rules' }" @click="tab = 'rules'">
              <AppIcon name="route" :size="16" /> {{ t("notifications.tabRules") }} <span class="tab-count">{{ rules.length }}</span>
            </button>
            <button :class="{ active: tab === 'history' }" @click="tab = 'history'">
              <AppIcon name="activity" :size="16" /> {{ t("notifications.tabRecords") }} <span class="tab-count">{{ deliveries.length }}</span>
              <span v-if="failedDeliveries.length" class="tab-alert">{{ failedDeliveries.length }}</span>
            </button>
          </nav>

          <section v-if="tab === 'channels'" class="workspace-layout">
            <section class="directory-panel">
              <header class="panel-heading">
                <span class="panel-heading-icon"><AppIcon name="network" :size="16" /></span>
                <div class="panel-heading-copy"><h3>{{ t("notifications.channelsTitle") }}</h3><p>{{ t("notifications.channelsPanelHint") }}</p></div>
                <AppIconButton :label="t('notifications.newChannel')" @click="resetC">＋</AppIconButton>
              </header>
              <AppScrollArea root-class="panel-scroll" type="auto">
                <div v-if="!channels.length" class="empty-directory">
                  <span class="empty-icon"><AppIcon name="network" :size="22" /></span>
                  <strong>{{ t("notifications.emptyChannels") }}</strong><p>{{ t("notifications.emptyChannelsHint") }}</p>
                  <AppButton variant="primary" block @click="resetC">{{ t("notifications.createFirstChannel") }}</AppButton>
                </div>
                <div
                  v-for="item in channels"
                  :key="item.id"
                  class="directory-item"
                  :class="{ selected: cid === item.id }"
                  role="button"
                  tabindex="0"
                  @click="editC(item)"
                  @keydown.enter.prevent="editC(item)"
                  @keydown.space.prevent="editC(item)"
                >
                  <span class="provider-icon"><AppIcon :name="item.provider === 'dingtalk' ? 'bell-ring' : 'globe'" :size="18" /></span>
                  <span class="directory-content"><strong>{{ item.name }}</strong><small>{{ providerName(item.provider) }}</small><small class="url-preview">{{ shortUrl(item.config.url) || t("notifications.urlUnset") }}</small></span>
                  <span class="status-dot" :class="{ online: item.enabled }" :title="item.enabled ? t('notifications.statusEnabled') : t('notifications.statusDisabled')"></span>
                  <AppIconButton class="row-delete" size="sm" danger :label="t('notifications.deleteChannelTitle', { name: item.name })" @click.stop="deleteC(item)"><AppIcon name="trash-2" :size="14" /></AppIconButton>
                </div>
              </AppScrollArea>
              <footer v-if="channels.length" class="panel-footer"><span class="status-dot online"></span> {{ t("notifications.channelsEnabledCount", { count: enabledChannels.length }) }}</footer>
            </section>

            <form v-if="channelEditorOpen" class="editor-panel" @submit.prevent="saveC">
              <header class="editor-heading">
                <div class="editor-title-mark"><AppIcon name="network" :size="19" /></div>
                <div class="editor-heading-copy"><div class="editor-kicker">{{ cid ? t("notifications.channelKickerEdit") : t("notifications.channelKickerNew") }}</div><h3>{{ cid ? t("notifications.channelEdit") : t("notifications.channelNew") }}</h3><p>{{ t("notifications.channelDesc") }}</p></div>
                <div class="editor-heading-tools"><span class="status-pill" :class="ch.enabled ? 'pill-enabled' : 'pill-disabled'"><span class="status-dot" :class="{ online: ch.enabled }"></span>{{ ch.enabled ? t("notifications.statusEnabled") : t("notifications.statusDisabled") }}</span></div>
              </header>
              <AppScrollArea root-class="editor-scroll" type="auto"><div class="editor-body">
                <section class="form-section">
                  <div class="section-title"><span>01</span><div><h4>{{ t("notifications.sectionBasics") }}</h4><p>{{ t("notifications.sectionBasicsHint") }}</p></div></div>
                  <div class="field-grid">
                    <label class="field"><span>{{ t("notifications.fieldName") }} <i>*</i></span><AppInput v-model="ch.name" required maxlength="80" :placeholder="t('notifications.placeholderChannelName')" /></label>
                    <label class="field"><span>{{ t("notifications.fieldProvider") }} <i>*</i></span><AppSelect block :model-value="ch.config.provider" :options="providerOptions" @update:model-value="setProvider" /></label>
                  </div>
                </section>

                <section class="form-section">
                  <div class="section-title"><span>02</span><div><h4>{{ t("notifications.sectionConnection") }}</h4><p>{{ t("notifications.sectionConnectionHint") }}</p></div></div>
                  <label class="field">
                    <span>{{ t("notifications.fieldUrl") }} <i>*</i></span>
                    <CodeMirrorField :model-value="ch.config.url" single-line :height="42" language="text" :aria-label="t('notifications.fieldUrl')" :placeholder="ch.config.provider === 'dingtalk' ? t('notifications.placeholderUrlDingTalk') : t('notifications.placeholderUrlHttp')" @update:model-value="ch.config.url = $event" />
                    <small class="field-hint"><AppIcon name="shield-check" :size="13" /> {{ t("notifications.hintUrlRedacted") }}</small>
                  </label>
                  <template v-if="ch.config.provider === 'dingtalk'">
                    <label class="field">
                      <span>{{ t("notifications.fieldSecret") }} <em>{{ t("notifications.optional") }}</em></span>
                      <div class="secret-input"><AppInput v-model="ch.config.dingTalkSecret" :type="showSecret ? 'text' : 'password'" autocomplete="new-password" :placeholder="cid && channels.find(x => x.id === cid)?.hasSecret ? t('notifications.placeholderSecretSaved') : t('notifications.placeholderSecretNew')" /><AppIconButton :label="showSecret ? t('notifications.fieldSecret') : t('notifications.fieldSecret')" @click="showSecret = !showSecret"><AppIcon :name="showSecret ? 'eye-off' : 'eye'" :size="16" /></AppIconButton></div>
                      <small class="field-hint">{{ t("notifications.hintSecretHidden") }}</small>
                    </label>
                    <label class="field"><span>{{ t("notifications.fieldMessageType") }}</span><AppSelect block :model-value="ch.config.dingTalkMessageType" :options="messageTypeOptions" @update:model-value="setMessageType" /></label>
                    <label class="field"><span>{{ t("notifications.fieldMessageTemplate") }}</span><CodeMirrorField :model-value="ch.config.messageTemplate" language="text" :height="120" :aria-label="t('notifications.fieldMessageTemplate')" @update:model-value="ch.config.messageTemplate = $event" /><small class="field-hint">{{ t("notifications.hintVariables") }}<code v-pre>{{event}}</code>、<code v-pre>{{status}}</code>、<code v-pre>{{message}}</code>、<code v-pre>{{timestamp}}</code>、<code v-pre>{{ok}}</code>。</small></label>
                    <label class="field"><span>{{ t("notifications.fieldTestMessage") }}</span><CodeMirrorField :model-value="ch.config.testMessageTemplate" language="text" :height="82" :aria-label="t('notifications.fieldTestMessage')" @update:model-value="ch.config.testMessageTemplate = $event" /></label>
                  </template>
                  <template v-else>
                    <div class="field-grid">
                      <label class="field"><span>{{ t("notifications.fieldMethod") }}</span><AppSelect block :model-value="ch.config.method" :options="methodOptions" @update:model-value="setMethod" /></label>
                      <label class="field"><span>{{ t("notifications.fieldContentType") }}</span><div class="field-static"><AppIcon name="file-text" :size="15" /> application/json</div></label>
                    </div>
                    <label class="field"><span>{{ t("notifications.fieldHeaders") }} <em>{{ t("notifications.json") }}</em></span><WebhookBodyEditor :model-value="ch.config.headers" :height="126" placeholder='{"Authorization":"Bearer …"}' @update:model-value="ch.config.headers = $event" /><small class="field-hint">{{ t("notifications.hintHeadersRedacted") }}</small></label>
                    <label class="field"><span>{{ t("notifications.fieldBody") }} <em>{{ t("notifications.json") }}</em></span><WebhookBodyEditor :model-value="ch.config.body" :height="190" :sample="JSON.stringify({ event: '{{event}}', status: '{{status}}', ok: '{{ok}}', message: '{{message}}', timestamp: '{{timestamp}}' }, null, 2)" placeholder='{"event":"{{event}}","status":"{{status}}","message":"{{message}}"}' @update:model-value="ch.config.body = $event" /><small class="field-hint">{{ t("notifications.hintBodyJson") }}</small></label>
                    <label class="field"><span>{{ t("notifications.fieldTestBody") }} <em>{{ t("notifications.json") }}</em></span><WebhookBodyEditor :model-value="ch.config.testBody" :height="144" :sample='JSON.stringify({ event: "{{event}}", status: "{{status}}", ok: "{{ok}}", message: "{{message}}", timestamp: "{{timestamp}}" }, null, 2)' placeholder='{"event":"PacPilot test","status":"test"}' @update:model-value="ch.config.testBody = $event" /></label>
                  </template>
                </section>
                <section class="form-section compact-section">
                  <div class="section-title"><span>03</span><div><h4>{{ t("notifications.sectionChannelStatus") }}</h4><p>{{ t("notifications.sectionChannelStatusHint") }}</p></div></div>
                  <AppToggle v-model="ch.enabled" :label="t('notifications.toggleChannel')" :description="t('notifications.toggleChannelHint')" />
                </section>
              </div></AppScrollArea>
              <footer class="editor-footer">
                <AppButton variant="secondary" @click="resetC">{{ t("notifications.buttonNewBlank") }}</AppButton>
                <AppButton v-if="cid" variant="danger-ghost" @click="deleteC(channels.find(x => x.id === cid))"><AppIcon name="trash-2" :size="15" /> {{ t("common.delete") }}</AppButton>
                <span class="footer-spacer"></span>
                <AppButton variant="secondary" :disabled="!cid || (!!testingId && testingId === cid)" @click="testC(channels.find(x => x.id === cid))"><AppIcon :name="!!testingId && testingId === cid ? 'loader-circle' : 'activity'" :size="15" :class="{ spin: !!testingId && testingId === cid }" /> {{ !!testingId && testingId === cid ? t("notifications.buttonTesting") : t("notifications.buttonTest") }}</AppButton>
                <AppButton type="submit" variant="primary" :disabled="busy || !ch.name.trim() || !ch.config.url.trim()"><AppIcon name="save" :size="15" /> {{ busy ? t("notifications.buttonSaving") : t("notifications.buttonSaveChannel") }}</AppButton>
              </footer>
              <div v-if="cid && !channelReady" class="editor-note"><AppIcon name="info" :size="15" /> {{ t("notifications.hintChannelIncomplete") }}</div>
            </form>
            <section v-else class="editor-panel editor-placeholder" aria-live="polite"><div class="placeholder-icon"><AppIcon name="file-text" :size="22" /></div><p>{{ t("notifications.selectHint") }}</p></section>
          </section>

          <section v-else-if="tab === 'rules'" class="workspace-layout rule-layout">
            <section class="directory-panel">
              <header class="panel-heading">
                <span class="panel-heading-icon"><AppIcon name="route" :size="16" /></span>
                <div class="panel-heading-copy"><h3>{{ t("notifications.rulesTitle") }}</h3><p>{{ t("notifications.rulesPanelHint") }}</p></div>
                <AppIconButton :label="t('notifications.newRule')" @click="resetR">＋</AppIconButton>
              </header>
              <AppScrollArea root-class="panel-scroll" type="auto">
                <div v-if="!rules.length" class="empty-directory"><span class="empty-icon"><AppIcon name="route" :size="22" /></span><strong>{{ t("notifications.emptyRules") }}</strong><p>{{ t("notifications.emptyRulesHint") }}</p><AppButton variant="primary" block @click="resetR">{{ t("notifications.createFirstRule") }}</AppButton></div>
                <div
                  v-for="item in rules"
                  :key="item.id"
                  class="directory-item rule-directory-item"
                  :class="{ selected: rid === item.id }"
                  role="button"
                  tabindex="0"
                  @click="editR(item)"
                  @keydown.enter.prevent="editR(item)"
                  @keydown.space.prevent="editR(item)"
                >
                  <span class="provider-icon rule-provider"><AppIcon name="route" :size="18" /></span>
                  <span class="directory-content"><strong>{{ item.name }}</strong><small>{{ evName(item.eventType) }} · {{ phaseName(item.phase) }}</small><small>{{ outcomeName(item.outcome) }} · {{ item.channelIds.length }}</small></span>
                  <span class="status-dot" :class="{ online: item.enabled }" :title="item.enabled ? t('notifications.statusEnabled') : t('notifications.statusDisabled')"></span>
                  <AppIconButton class="row-delete" size="sm" danger :label="t('notifications.deleteRuleTitle', { name: item.name })" @click.stop="deleteR(item)"><AppIcon name="trash-2" :size="14" /></AppIconButton>
                </div>
              </AppScrollArea>
              <footer v-if="rules.length" class="panel-footer"><span class="status-dot online"></span> {{ t("notifications.rulesActiveCount", { count: enabledRules.length }) }}</footer>
            </section>

            <form v-if="ruleEditorOpen" class="editor-panel" @submit.prevent="saveR">
              <header class="editor-heading">
                <div class="editor-title-mark rule-title-mark"><AppIcon name="route" :size="19" /></div>
                <div class="editor-heading-copy"><div class="editor-kicker">{{ rid ? t("notifications.ruleKickerEdit") : t("notifications.ruleKickerNew") }}</div><h3>{{ rid ? t("notifications.ruleEdit") : t("notifications.ruleNew") }}</h3><p>{{ t("notifications.ruleDesc") }}</p></div>
                <span class="status-pill" :class="rule.enabled ? 'pill-enabled' : 'pill-disabled'"><span class="status-dot" :class="{ online: rule.enabled }"></span>{{ rule.enabled ? t("notifications.statusEnabled") : t("notifications.statusDisabled") }}</span>
              </header>
              <AppScrollArea root-class="editor-scroll" type="auto"><div class="editor-body">
                <section class="form-section">
                  <div class="section-title"><span>01</span><div><h4>{{ t("notifications.sectionRuleInfo") }}</h4><p>{{ t("notifications.sectionRuleInfoHint") }}</p></div></div>
                  <label class="field"><span>{{ t("notifications.fieldRuleName") }} <i>*</i></span><AppInput v-model="rule.name" required maxlength="80" :placeholder="t('notifications.placeholderRuleName')" /></label>
                </section>
                <section class="form-section">
                  <div class="section-title"><span>02</span><div><h4>{{ t("notifications.sectionConditions") }}</h4><p>{{ t("notifications.sectionConditionsHint") }}</p></div></div>
                  <label class="field"><span>{{ t("notifications.fieldEvent") }}</span><AppSelect block :model-value="rule.eventType" :options="eventOptions" @update:model-value="setEvent(String($event))" /></label>
                  <div class="field-grid">
                    <label class="field"><span>{{ t("notifications.fieldPhase") }}</span><AppSelect block :model-value="rule.phase" :options="phaseOptions" @update:model-value="setPhase" /></label>
                    <label class="field"><span>{{ t("notifications.fieldOutcome") }}</span><AppSelect block :model-value="rule.outcome ?? 'any'" :options="outcomeOptions" @update:model-value="setOutcome" /></label>
                  </div>
                  <div class="condition-hint"><AppIcon name="info" :size="16" /><div><strong>{{ phaseName(rule.phase) }} · {{ outcomeName(rule.outcome) }}</strong><p>{{ phaseDescription }}</p></div></div>
                  <label class="field"><span>{{ t("notifications.fieldSubjectType") }} <em>{{ t("notifications.optionalCondition") }}</em></span><AppInput v-model="rule.subjectType" :placeholder="t('notifications.placeholderSubjectType')" /><small class="field-hint">{{ t("notifications.hintSubjectType") }}</small></label>
                </section>
                <section class="form-section">
                  <div class="section-title"><span>03</span><div><h4>{{ t("notifications.sectionTargets") }}</h4><p>{{ t("notifications.sectionTargetsHint") }}</p></div></div>
                  <div v-if="!channels.length" class="inline-empty"><AppIcon name="network" :size="18" /><div><strong>{{ t("notifications.noChannelsForRule") }}</strong><p>{{ t("notifications.noChannelsForRuleHint") }}</p></div><AppButton variant="secondary" @click="tab = 'channels'">{{ t("notifications.goToChannels") }}</AppButton></div>
                  <div v-else class="channel-options">
                    <label v-for="item in channels" :key="item.id" class="channel-option" :class="{ checked: rule.channelIds.includes(item.id), unavailable: !item.enabled }">
                      <AppCheckbox
                        :model-value="rule.channelIds.includes(item.id)"
                        :disabled="!item.enabled && !rule.channelIds.includes(item.id)"
                        :aria-label="item.name"
                        @update:model-value="toggleChannel(item.id, $event)"
                      />
                      <span class="option-icon"><AppIcon :name="item.provider === 'dingtalk' ? 'bell-ring' : 'globe'" :size="17" /></span>
                      <span class="option-copy"><strong>{{ item.name }}</strong><small>{{ providerName(item.provider) }} · {{ item.enabled ? t("notifications.statusEnabled") : t("notifications.statusDisabled") }}</small></span>
                      <AppIcon v-if="rule.channelIds.includes(item.id)" name="circle-check" :size="17" class="option-check" />
                    </label>
                  </div>
                  <small v-if="rule.channelIds.length" class="field-hint">{{ t("notifications.hintTargetsSummary", { count: rule.channelIds.length, names: rule.channelIds.map(channelName).join(", ") }) }}</small>
                </section>
                <section class="form-section compact-section">
                  <div class="section-title"><span>04</span><div><h4>{{ t("notifications.sectionRuleStatus") }}</h4><p>{{ t("notifications.sectionRuleStatusHint") }}</p></div></div>
                  <AppToggle v-model="rule.enabled" :label="t('notifications.toggleRule')" :description="t('notifications.toggleRuleHint')" />
                </section>
              </div></AppScrollArea>
              <footer class="editor-footer">
                <AppButton variant="secondary" @click="resetR">{{ t("notifications.buttonNewBlank") }}</AppButton>
                <AppButton v-if="rid" variant="danger-ghost" @click="deleteR(rules.find(x => x.id === rid))"><AppIcon name="trash-2" :size="15" /> {{ t("common.delete") }}</AppButton>
                <span class="footer-spacer"></span>
                <AppButton type="submit" variant="primary" :disabled="busy || !rule.name.trim() || !rule.channelIds.length"><AppIcon name="save" :size="15" /> {{ busy ? t("notifications.buttonSaving") : t("notifications.buttonSaveRule") }}</AppButton>
              </footer>
            </form>
            <section v-else class="editor-panel editor-placeholder" aria-live="polite"><div class="placeholder-icon"><AppIcon name="file-text" :size="22" /></div><p>{{ t("notifications.selectHint") }}</p></section>
          </section>

          <section v-else class="history-workspace">
            <section class="history-panel">
              <header class="panel-heading">
                <span class="panel-heading-icon"><AppIcon name="bell-ring" :size="16" /></span>
                <div class="panel-heading-copy"><h3>{{ t("notifications.recordsTitle") }}</h3><p>{{ t("notifications.recordsHint") }}</p></div>
                <span class="neutral-count">{{ t("notifications.eventsCount", { count: filteredDeliveries.length }) }}</span>
                <AppSelect class="records-filter" :model-value="deliveryFilter" :options="statusFilterOptions" @update:model-value="deliveryFilter = String($event)" />
              </header>
              <div class="records-body">
                <VirtualTable
                  :items="filteredDeliveries"
                  item-key="id"
                  :col-span="6"
                  :row-height="56"
                  height="100%"
                  fixed-height
                  min-width="880px"
                  table-class="records-table"
                  :empty-text="deliveries.length ? t('notifications.recordsNoMatch') : t('notifications.emptyRecords')"
                  :load-more="() => {}"
                >
                  <template #columns>
                    <col style="width: 128px" />
                    <col style="width: 200px" />
                    <col style="width: 220px" />
                    <col style="width: 180px" />
                    <col style="width: 100px" />
                    <col style="width: 110px" />
                  </template>
                  <template #header>
                    <tr>
                      <th>{{ t("notifications.columnStatus") }}</th>
                      <th>{{ t("notifications.columnChannel") }}</th>
                      <th>{{ t("notifications.columnEvent") }}</th>
                      <th>{{ t("notifications.columnTime") }}</th>
                      <th>{{ t("notifications.columnAttempts") }}</th>
                      <th>{{ t("notifications.columnActions") }}</th>
                    </tr>
                  </template>
                  <template #row="{ item }">
                    <tr
                      class="record-row"
                      tabindex="0"
                      role="button"
                      :title="t('notifications.rowOpenHint')"
                      @click="openDeliveryDetails(item)"
                      @keydown.enter.prevent="openDeliveryDetails(item)"
                      @keydown.space.prevent="openDeliveryDetails(item)"
                    >
                      <td>
                        <span class="status-pill small-pill" :class="'delivery-pill-' + item.status"><AppIcon :name="statusIcon(item.status)" :size="13" />{{ statusName(item.status) }}</span>
                      </td>
                      <td class="cell-strong">{{ channelName(item.channelId) }}</td>
                      <td class="cell-muted">{{ deliveryEventLabel(item) }}</td>
                      <td class="cell-muted nowrap">{{ formatDate(item.updatedAt) }}</td>
                      <td class="cell-muted">{{ item.attemptCount }}</td>
                      <td>
                        <AppButton
                          v-if="item.status === 'failed'"
                          size="sm"
                          variant="secondary"
                          @click.stop="retry(item.id)"
                        ><AppIcon name="refresh-cw" :size="13" /> {{ t("notifications.retry") }}</AppButton>
                        <span v-else class="row-open-hint">{{ t("notifications.rowOpenHint") }}</span>
                      </td>
                    </tr>
                  </template>
                </VirtualTable>
              </div>
            </section>
          </section>

          <AppDialog
            :open="deliveryDetailOpen && !!selectedDelivery"
            :label="t('notifications.dialogTitle')"
            width="min(720px, calc(100vw - 16px))"
            @update:open="deliveryDetailOpen = $event"
          >
            <template #header>
              <div>
                <p class="eyebrow">{{ t("notifications.dialogEyebrow") }} {{ selectedDelivery ? String(selectedDelivery.id).slice(0, 8) : "" }}</p>
                <h2 class="dialog-title">{{ t("notifications.dialogTitle") }}</h2>
                <p class="dialog-sub">{{ selectedDelivery ? channelName(selectedDelivery.channelId) : "" }}</p>
              </div>
            </template>
            <template #body>
              <div v-if="selectedDelivery" class="record-detail">
                <div class="record-detail-grid">
                  <div><span>{{ t("notifications.columnStatus") }}</span><strong>{{ statusName(selectedDelivery.status) }}</strong></div>
                  <div><span>{{ t("notifications.columnChannel") }}</span><strong>{{ channelName(selectedDelivery.channelId) }}</strong></div>
                  <div><span>{{ t("notifications.dialogRule") }}</span><strong>{{ ruleNameById(selectedDelivery.ruleId) }}</strong></div>
                  <div><span>{{ t("notifications.dialogEvent") }}</span><strong>{{ deliveryEventLabel(selectedDelivery) }}</strong></div>
                  <div><span>{{ t("notifications.dialogPhase") }}</span><strong>{{ deliveryEvent(selectedDelivery) ? phaseName(deliveryEvent(selectedDelivery).phase) : "—" }}</strong></div>
                  <div><span>{{ t("notifications.dialogOutcome") }}</span><strong>{{ deliveryEvent(selectedDelivery) ? outcomeName(deliveryEvent(selectedDelivery).outcome) : "—" }}</strong></div>
                  <div><span>{{ t("notifications.dialogCreatedAt") }}</span><strong>{{ formatDate(selectedDelivery.createdAt) }}</strong></div>
                  <div><span>{{ t("notifications.dialogUpdatedAt") }}</span><strong>{{ formatDate(selectedDelivery.updatedAt) }}</strong></div>
                  <div><span>{{ t("notifications.dialogDeliveredAt") }}</span><strong>{{ selectedDelivery.deliveredAt ? formatDate(selectedDelivery.deliveredAt) : "—" }}</strong></div>
                  <div><span>{{ t("notifications.columnAttempts") }}</span><strong>{{ selectedDelivery.attemptCount }}</strong></div>
                </div>
                <section class="record-detail-block">
                  <h3>{{ t("notifications.dialogSummarySection") }}</h3>
                  <p>{{ deliveryEvent(selectedDelivery)?.summary || t("notifications.dialogNoSummary") }}</p>
                </section>
                <section class="record-detail-block record-detail-error">
                  <h3>{{ t("notifications.dialogErrorSection") }}</h3>
                  <pre v-if="selectedDelivery.lastError">{{ selectedDelivery.lastError }}</pre>
                  <p v-else>{{ t("notifications.dialogNoError") }}</p>
                </section>
                <div v-if="selectedDelivery.status === 'failed'" class="record-detail-actions">
                  <AppButton variant="secondary" @click="retry(selectedDelivery.id)"><AppIcon name="refresh-cw" :size="14" /> {{ t("notifications.retry") }}</AppButton>
                </div>
              </div>
            </template>
          </AppDialog>
        </section>
      </template>
      <AppFooter />
    </main>
  </AdminLayout>
</template>

<style scoped>
@reference "@/styles/tailwind.css";

/* ============================================================
   Notification workspace — three-tier layout contract.

   1. Pinned tier (>620px tall, >900px wide): intro and overview scroll
      away; the workspace sticks below the admin header, sized to the band
      between header offset and footer reserve.
   2. Shrink tier: only the middle row reacts, floored at 320px.
   3. Flow tier: workspace unsticks and the document scrolls as one page.

   Scrollbars come exclusively from AppScrollArea and are tuned through its
   public CSS variables.
   ============================================================ */

.webhook-page {
  --wh-radius-card: 16px;
  --wh-radius-panel: 14px;
  --wh-radius-item: 11px;
  --wh-radius-control: 10px;

  --wh-panel-bg: var(--surface);
  --wh-heading-bg: var(--surface-2);
  --wh-item-hover: color-mix(in srgb, var(--accent) 6%, var(--surface-2));

  --scrollbar-size: 10px;
  --scrollbar-thumb: color-mix(in srgb, var(--text) 26%, transparent);
  --scrollbar-thumb-hover: color-mix(in srgb, var(--text) 46%, transparent);

  --wh-directory-height: clamp(300px, 46dvh, 540px);
  --wh-editor-height: clamp(360px, 56dvh, 680px);
  --wh-history-height: clamp(320px, 50dvh, 620px);

  --wh-header-gap: 25px;
  --wh-footer-reserve: 100px;

  @apply flex w-full min-w-0 min-h-0 flex-col box-border gap-[clamp(12px,1.35vw,18px)];
  flex: 0 0 auto;
  color: var(--text);
}

.webhook-page > :deep(.app-footer) {
  @apply m-0 shrink-0;
}

/* ---------- Page intro ---------- */

.page-intro,
.overview-grid {
  @apply shrink-0;
}

.page-intro {
  @apply relative flex items-center justify-between gap-6 overflow-hidden rounded-[var(--wh-radius-card)] border px-[26px] py-[23px];
  border-color: color-mix(in srgb, var(--accent) 14%, var(--line));
  background:
    radial-gradient(120% 160% at 0% 0%, color-mix(in srgb, var(--accent) 9%, transparent), transparent 55%),
    var(--wh-panel-bg);
  box-shadow: var(--shadow);
}

.page-intro::before {
  @apply absolute bottom-0 left-0 top-0 w-[3px];
  background: linear-gradient(180deg, var(--accent), color-mix(in srgb, var(--accent) 30%, transparent));
  content: "";
}

.intro-copy {
  @apply min-w-0;
}

.eyebrow,
.editor-kicker {
  @apply flex items-center gap-[7px] text-[9px] font-extrabold tracking-[0.13em];
  color: var(--accent);
}

.page-intro h2 {
  @apply mb-[5px] mt-[9px] leading-tight tracking-[-0.035em];
  font-size: clamp(18px, 1.6vw, 21px);
}

.page-intro p {
  @apply m-0 text-xs leading-normal;
  color: var(--muted);
}

.intro-state {
  @apply flex shrink-0 items-center gap-[11px] rounded-xl border px-[15px] py-3;
  border-color: var(--line);
  background: var(--wh-heading-bg);
}

.intro-state strong,
.intro-state small {
  @apply block;
}

.intro-state strong {
  @apply text-[11px];
}

.intro-state small {
  @apply mt-1 text-[10px];
  color: var(--muted);
}

.state-dot {
  @apply inline-block h-[7px] w-[7px] shrink-0 rounded-full;
  background: var(--muted);
}

.state-dot.online {
  background: var(--green);
  box-shadow: 0 0 0 3px var(--green-soft);
}

/* ---------- Overview cards ---------- */

.overview-grid {
  @apply grid grid-cols-4 gap-3;
}

.overview-card {
  @apply min-w-0 rounded-[var(--wh-radius-panel)] border px-[17px] pb-3.5 pt-[15px] transition-[border-color,transform,box-shadow];
  border-color: var(--line);
  background: var(--wh-panel-bg);
  box-shadow: var(--shadow);
}

.overview-card:hover {
  @apply -translate-y-px;
  border-color: color-mix(in srgb, var(--accent) 26%, var(--line));
  box-shadow:
    0 2px 4px color-mix(in srgb, var(--text) 5%, transparent),
    0 10px 22px color-mix(in srgb, var(--text) 5%, transparent);
}

.overview-top {
  @apply flex items-start justify-between gap-2.5;
}

.overview-icon {
  @apply grid h-[34px] w-[34px] place-items-center rounded-[var(--wh-radius-control)] border;
  border-color: var(--line);
  background: color-mix(in srgb, var(--accent-soft) 62%, var(--surface));
  color: var(--accent);
}

.rule-icon,
.delivery-icon {
  color: color-mix(in srgb, var(--accent) 78%, var(--green));
}

.failure-icon {
  color: var(--muted);
}

.has-failures {
  border-color: color-mix(in srgb, var(--red) 26%, var(--line));
}

.has-failures .failure-icon {
  border-color: color-mix(in srgb, var(--red) 24%, var(--line));
  background: var(--red-soft);
  color: var(--red);
}

.overview-label {
  @apply mt-3 text-[11px];
  color: var(--muted);
}

.overview-value {
  @apply text-2xl font-extrabold leading-tight tracking-[-0.04em] tabular-nums;
}

.overview-value span {
  @apply text-[13px] font-medium tracking-normal;
  color: var(--muted);
}

.overview-foot {
  @apply mt-[5px] text-[10px] leading-snug;
  color: var(--muted);
}

/* ---------- Loading / error states ---------- */

.state-panel {
  @apply flex min-h-[120px] shrink-0 items-center justify-center gap-[11px] rounded-[var(--wh-radius-panel)] border p-6 text-xs;
  border-color: var(--line);
  background: var(--wh-panel-bg);
  color: var(--muted);
}

.state-error {
  @apply justify-start;
  color: var(--red);
}
.state-error div {
  @apply min-w-0 flex-auto;
}
.state-error strong {
  @apply text-xs;
}
.state-error p {
  @apply mb-0 mt-[5px] text-[11px];
  color: var(--muted);
  overflow-wrap: anywhere;
}

/* ---------- Workspace frame ---------- */

.workspace-region {
  @apply sticky z-[1] flex w-full min-w-0 min-h-0 flex-col gap-3;
  flex: 0 0 auto;
  top: calc(var(--admin-topbar-space, 104px) + var(--wh-header-gap, 25px));
  height: calc(
    100dvh - var(--admin-topbar-space, 104px) - var(--wh-header-gap, 25px) -
      var(--wh-footer-reserve, 100px)
  );
  max-height: calc(
    100dvh - var(--admin-topbar-space, 104px) - var(--wh-header-gap, 25px) -
      var(--wh-footer-reserve, 100px)
  );
  background: var(--bg);
}

.workspace-tabs {
  @apply flex shrink-0 items-center gap-1 rounded-[13px] border p-1;
  border-color: var(--line);
  background: var(--wh-heading-bg);
}

.workspace-tabs button {
  @apply relative inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-[var(--wh-radius-control)] border border-transparent bg-transparent px-[15px] text-xs font-semibold transition-[color,background,border-color];
  min-height: 42px;
  color: var(--muted);
}

.workspace-tabs button:hover {
  background: var(--wh-item-hover);
  color: var(--text);
}

.workspace-tabs button.active {
  border-color: color-mix(in srgb, var(--accent) 24%, var(--line));
  background: var(--wh-panel-bg);
  color: var(--accent);
  box-shadow: 0 1px 3px color-mix(in srgb, var(--text) 7%, transparent);
}

.workspace-tabs button.active::after {
  @apply absolute -bottom-px left-3 right-3 h-0.5 rounded-t-sm;
  background: var(--accent);
  content: "";
}

.tab-count,
.tab-alert {
  @apply inline-grid h-5 min-w-5 place-items-center rounded-md px-[5px] text-[10px] tabular-nums;
}

.tab-count {
  background: var(--wh-heading-bg);
  color: var(--muted);
}

.workspace-tabs button.active .tab-count {
  background: var(--accent-soft);
  color: var(--accent);
}

.tab-alert {
  background: var(--red-soft);
  color: var(--red);
}

.workspace-layout,
.history-workspace {
  @apply flex min-h-[320px] w-full min-w-0 items-stretch gap-3.5 overflow-hidden;
  flex: 1 1 0%;
  max-height: 100%;
}

/* ---------- Panels ---------- */

.directory-panel,
.editor-panel,
.history-panel {
  @apply flex min-w-0 min-h-0 flex-col overflow-hidden rounded-[var(--wh-radius-panel)] border;
  flex: 1 1 0%;
  max-height: 100%;
  border-color: var(--line);
  background: var(--wh-panel-bg);
  box-shadow: var(--shadow);
}

.panel-heading {
  @apply flex shrink-0 items-center gap-[11px] border-b px-[15px] py-[13px];
  border-color: color-mix(in srgb, var(--accent) 16%, var(--line));
  background: linear-gradient(180deg, color-mix(in srgb, var(--accent) 8%, var(--surface-2)), var(--wh-heading-bg));
}

.panel-heading-icon {
  @apply grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[9px] border;
  border-color: color-mix(in srgb, var(--accent) 22%, var(--line));
  background: var(--accent-soft);
  color: var(--accent);
}

.panel-heading-copy {
  @apply grid min-w-0 flex-auto gap-[3px];
}

.panel-heading-copy h3 {
  @apply m-0 text-[12.5px] font-bold tracking-tight;
}

.panel-heading-copy p {
  @apply m-0 overflow-hidden text-ellipsis whitespace-nowrap text-[10px] leading-snug;
  color: var(--muted);
}

.panel-scroll {
  @apply w-full min-w-0 min-h-0;
  flex: 1 1 0%;
}

.panel-scroll :deep(.app-scroll-area-viewport) {
  @apply h-full;
}

.panel-footer {
  @apply flex shrink-0 items-center gap-2 border-t px-[15px] py-2.5 text-[10px];
  border-color: var(--line);
  background: var(--wh-heading-bg);
  color: var(--muted);
}

/* ---------- Directory panel ---------- */

.directory-panel {
  @apply w-[min(32%,340px)];
  flex: 0 0 min(32%, 340px);
  border-color: color-mix(in srgb, var(--accent) 12%, var(--line));
}

.directory-item {
  @apply relative flex cursor-pointer items-center gap-2.5 rounded-[var(--wh-radius-item)] border border-transparent bg-transparent px-2.5 py-[9px] text-left transition-[background,border-color,box-shadow];
  width: calc(100% - 16px);
  margin: 4px 8px;
  color: var(--text);
}

.directory-item:hover {
  background: var(--wh-item-hover);
}

.directory-item:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.directory-item.selected {
  border-color: color-mix(in srgb, var(--accent) 36%, var(--line));
  background: var(--accent-soft);
  box-shadow: inset 3px 0 0 var(--accent);
}

.directory-item.selected .provider-icon {
  border-color: color-mix(in srgb, var(--accent) 30%, var(--line));
  background: var(--wh-panel-bg);
  color: var(--accent);
}

.row-delete {
  @apply pointer-events-none opacity-0 transition-opacity;
}

.directory-item:hover .row-delete,
.directory-item:focus-within .row-delete,
.row-delete:focus-visible {
  @apply pointer-events-auto opacity-100;
}

@media (hover: none) {
  .row-delete {
    @apply pointer-events-auto opacity-100;
  }
}

.provider-icon {
  @apply grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[var(--wh-radius-control)] border;
  border-color: var(--line);
  background: var(--wh-heading-bg);
  color: var(--accent);
}

.directory-content {
  @apply grid min-w-0 flex-auto gap-1;
}

.directory-content strong,
.directory-content small {
  @apply overflow-hidden text-ellipsis whitespace-nowrap;
}

.directory-content strong {
  @apply text-[11px] font-bold;
  color: var(--text);
}

.directory-content small {
  @apply text-[10px] leading-snug;
  color: var(--muted);
}

.directory-content .url-preview {
  @apply font-mono text-[9px] opacity-85;
}

.empty-directory,
.empty-history {
  @apply flex flex-col items-center gap-2 px-5 py-7 text-center;
}

.empty-icon,
.placeholder-icon {
  @apply mb-[3px] grid h-11 w-11 place-items-center rounded-[13px] border;
  border-color: var(--line);
  background: var(--wh-heading-bg);
  color: var(--muted);
}

.empty-directory strong,
.empty-history strong {
  @apply text-xs;
}

.empty-directory p,
.empty-history p {
  @apply mb-1.5 mt-0 max-w-[260px] text-[10px] leading-normal;
  color: var(--muted);
}

/* ---------- Editor panel ---------- */

.editor-panel {
  @apply flex w-0 flex-col;
  flex: 1 1 0%;
  height: 100%;
  max-height: 100%;
}

.editor-heading {
  @apply flex shrink-0 items-center gap-[13px] border-b px-[23px] py-5;
  border-color: var(--line);
  background: var(--wh-heading-bg);
}

.editor-title-mark {
  @apply grid h-[42px] w-[42px] shrink-0 place-items-center rounded-xl border;
  border-color: color-mix(in srgb, var(--accent) 22%, var(--line));
  background: var(--accent-soft);
  color: var(--accent);
}

.editor-heading-copy {
  @apply min-w-0 flex-auto;
}

.editor-heading-tools {
  @apply ml-auto flex items-center gap-3;
}

.editor-heading h3 {
  @apply my-1 text-[15px] font-extrabold tracking-tight;
}

.editor-heading p {
  @apply m-0 text-[10px] leading-normal;
  color: var(--muted);
}

.editor-scroll {
  @apply block w-full min-w-0 min-h-0 overflow-hidden;
  flex: 1 1 0%;
  max-height: 100%;
}

.editor-scroll :deep(.app-scroll-area-viewport) {
  @apply h-full w-full min-h-0 overflow-x-hidden overflow-y-auto;
  scrollbar-gutter: stable;
}

/* ---------- Forms ---------- */

.status-pill {
  @apply inline-flex shrink-0 items-center gap-[7px] whitespace-nowrap rounded-[20px] border px-[9px] py-1.5 text-[10px] font-semibold;
  border-color: var(--line);
  background: var(--wh-panel-bg);
  color: var(--muted);
}

.pill-enabled {
  border-color: color-mix(in srgb, var(--green) 24%, var(--line));
  background: var(--green-soft);
  color: var(--green);
}

.pill-disabled {
  color: var(--muted);
}

.editor-body {
  @apply grid content-start gap-0 px-[23px];
}

.form-section {
  @apply grid gap-[17px] border-b pb-6 pt-[22px];
  border-color: var(--line);
}

.form-section:last-child {
  @apply border-b-0;
}

.section-title {
  @apply flex items-start gap-3;
}

.section-title > span {
  @apply grid h-[27px] w-[27px] shrink-0 place-items-center rounded-lg border text-[10px] font-extrabold tabular-nums;
  border-color: var(--line);
  background: var(--wh-heading-bg);
  color: var(--muted);
}

.section-title h4 {
  @apply mb-1 mt-px text-xs font-bold;
}
.section-title p {
  @apply m-0 text-[10px] leading-normal;
  color: var(--muted);
}

.field-grid {
  @apply grid grid-cols-2 gap-3.5;
}

.field {
  @apply grid min-w-0 gap-[7px] text-[11px] font-semibold;
  color: var(--text);
}

.field > span:first-child {
  @apply flex flex-wrap items-center gap-[5px];
}

.field i {
  @apply not-italic;
  color: var(--red);
}
.field em {
  @apply text-[10px] font-medium not-italic;
  color: var(--muted);
}

.field :deep(.CodeMirror),
.field :deep(.app-select) {
  @apply w-full min-w-0;
}

.field :deep(.CodeMirror) {
  @apply rounded-[var(--wh-radius-control)];
}

.field-hint {
  @apply m-0 flex items-start gap-1.5 text-[10px] font-normal leading-normal;
  color: var(--muted);
}

.field-hint code {
  @apply rounded-[4px] px-1 py-px font-mono text-[9px];
  background: var(--wh-heading-bg);
}

.secret-input {
  @apply flex min-w-0 gap-[7px];
}
.secret-input input {
  @apply min-w-0 flex-1;
}

.field-static {
  @apply flex items-center gap-2 rounded-[var(--wh-radius-control)] border px-[11px] font-mono text-[10px] font-medium;
  min-height: 41px;
  border-color: var(--line);
  background: var(--wh-heading-bg);
  color: var(--muted);
}

.editor-footer {
  @apply flex shrink-0 flex-wrap items-center gap-2 border-t px-[23px] py-3.5;
  border-color: var(--line);
  background: var(--wh-heading-bg);
}

.footer-spacer {
  @apply flex-auto;
}

.editor-note {
  @apply flex shrink-0 items-start gap-2 border-t pb-[15px] pl-[23px] pr-[23px] pt-[11px] text-[10px] leading-normal;
  border-color: color-mix(in srgb, var(--red) 16%, var(--line));
  background: color-mix(in srgb, var(--red-soft) 55%, var(--wh-panel-bg));
  color: var(--muted);
}

.editor-note :deep(svg) {
  color: var(--red);
}

.workspace-tabs button:focus-visible,
.directory-item:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

/* ---------- Rules: channel multi-select ---------- */

.condition-hint {
  @apply flex items-start gap-2.5 rounded-[var(--wh-radius-item)] border p-3;
  border-color: color-mix(in srgb, var(--accent) 20%, var(--line));
  background: var(--accent-soft);
  color: var(--accent);
}

.condition-hint strong {
  @apply text-[11px];
}
.condition-hint p {
  @apply mb-0 mt-1 text-[10px] leading-normal;
  color: var(--text);
}

.channel-options {
  @apply grid gap-2;
}

.channel-option {
  @apply relative flex min-w-0 cursor-pointer items-center gap-2.5 rounded-[var(--wh-radius-item)] border p-3 transition-[background,border-color,box-shadow];
  border-color: var(--line);
  background: var(--wh-panel-bg);
}

.channel-option:hover {
  background: var(--wh-item-hover);
}

.channel-option.checked {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--line));
  background: var(--accent-soft);
  box-shadow: inset 3px 0 0 var(--accent);
}

.channel-option.unavailable {
  @apply cursor-not-allowed opacity-55;
}

.option-icon {
  @apply grid h-[33px] w-[33px] shrink-0 place-items-center rounded-[9px] border;
  border-color: var(--line);
  background: var(--wh-panel-bg);
  color: var(--accent);
}

.option-copy {
  @apply grid min-w-0 flex-auto gap-1;
}
.option-copy strong {
  @apply text-[11px];
  overflow-wrap: anywhere;
}
.option-copy small {
  @apply text-[10px];
  color: var(--muted);
}
.option-check {
  color: var(--accent);
}

.inline-empty {
  @apply flex items-center gap-2.5 rounded-[var(--wh-radius-item)] border border-dashed p-[13px];
  border-color: var(--line);
  color: var(--muted);
}

.inline-empty div {
  @apply min-w-0 flex-auto;
}
.inline-empty strong {
  @apply text-[11px];
  color: var(--text);
}
.inline-empty p {
  @apply mb-0 mt-1 text-[10px] leading-normal;
}

/* ---------- Records table ---------- */

.history-workspace {
  @apply grid grid-cols-1;
}

.records-body {
  @apply grid min-h-0;
  flex: 1 1 0%;
  grid-template-rows: minmax(0, 1fr);
}

.record-row {
  @apply cursor-pointer transition-colors;
}

.record-row:hover {
  background: var(--wh-item-hover);
}

.record-row:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.cell-strong {
  @apply font-semibold;
}
.cell-muted {
  color: var(--muted);
}
.nowrap {
  @apply whitespace-nowrap;
}

.row-open-hint {
  @apply whitespace-nowrap text-[10px];
  color: var(--muted);
}

/* ---------- Notification detail dialog ---------- */

.dialog-title {
  @apply mb-0.5 mt-1 text-[17px] font-extrabold;
}

.dialog-sub {
  @apply m-0 text-[11px];
  color: var(--muted);
}

.record-detail {
  @apply grid gap-4;
}

.record-detail-grid {
  @apply grid gap-x-[18px] gap-y-[13px];
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
}

.record-detail-grid > div {
  @apply grid min-w-0 gap-1;
}

.record-detail-grid span {
  @apply text-[10px];
  color: var(--muted);
}

.record-detail-grid strong {
  @apply text-xs;
  overflow-wrap: anywhere;
}

.record-detail-block {
  @apply grid gap-2 border-t pt-[13px];
  border-color: var(--line);
}

.record-detail-block h3 {
  @apply m-0 text-[11px] font-bold;
}

.record-detail-block p {
  @apply m-0 text-[11px] leading-normal;
  color: var(--muted);
  overflow-wrap: anywhere;
}

.record-detail-block pre {
  @apply m-0 whitespace-pre-wrap rounded-lg p-2.5 font-mono text-[10px] leading-normal;
  background: var(--red-soft);
  color: var(--red);
  overflow-wrap: anywhere;
}

.record-detail-actions {
  @apply flex justify-end gap-2;
}

.neutral-count {
  @apply whitespace-nowrap rounded-[7px] border px-2 py-[5px] text-[10px];
  border-color: var(--line);
  color: var(--muted);
}

.event-row,
.delivery-row {
  @apply flex items-start gap-[11px] border-t px-[19px] py-[15px] transition-colors;
  border-color: var(--line);
}

.event-row:hover,
.delivery-row:hover {
  background: var(--wh-item-hover);
}

.timeline-marker,
.delivery-status-icon {
  @apply grid h-8 w-8 shrink-0 place-items-center rounded-[var(--wh-radius-control)] border;
  border-color: var(--line);
  background: var(--wh-heading-bg);
  color: var(--muted);
}

.event-row:has(.outcome-failure) .timeline-marker {
  border-color: color-mix(in srgb, var(--red) 20%, var(--line));
  background: var(--red-soft);
  color: var(--red);
}

.history-row-content {
  @apply min-w-0 flex-auto;
}
.history-row-title {
  @apply flex flex-wrap items-center gap-[7px];
}
.history-row-title strong {
  @apply text-[11px];
}

.history-row-content > p {
  @apply my-1.5 text-[10px] leading-normal;
  color: var(--muted);
  overflow-wrap: anywhere;
}

.history-row-content > small {
  @apply text-[9px] leading-normal;
  color: var(--muted);
}

.phase-tag,
.outcome-tag {
  @apply inline-flex items-center whitespace-nowrap rounded-[5px] px-1.5 py-[3px] text-[9px];
  background: var(--wh-heading-bg);
  color: var(--muted);
}

.outcome-success {
  background: var(--green-soft);
  color: var(--green);
}
.outcome-failure {
  background: var(--red-soft);
  color: var(--red);
}

.delivery-succeeded {
  border-color: color-mix(in srgb, var(--green) 22%, var(--line));
  background: var(--green-soft);
  color: var(--green);
}
.delivery-failed {
  border-color: color-mix(in srgb, var(--red) 22%, var(--line));
  background: var(--red-soft);
  color: var(--red);
}
.delivery-sending {
  background: var(--accent-soft);
  color: var(--accent);
}

.small-pill {
  @apply px-[7px] py-1 text-[9px];
}
.delivery-pill-succeeded {
  border-color: color-mix(in srgb, var(--green) 22%, var(--line));
  background: var(--green-soft);
  color: var(--green);
}
.delivery-pill-failed {
  border-color: color-mix(in srgb, var(--red) 22%, var(--line));
  background: var(--red-soft);
  color: var(--red);
}

.records-filter {
  @apply w-[148px] shrink-0;
}

.delivery-error {
  @apply rounded-[7px] px-[9px] py-2;
  background: var(--red-soft);
  color: var(--red) !important;
}

/* ---------- Editor placeholder ---------- */

.editor-placeholder {
  @apply items-center justify-center gap-3.5 p-7 text-center;
  color: var(--muted);
}

.editor-placeholder p {
  @apply m-0 text-[13px] leading-[1.7];
}

.spin {
  animation: webhook-spin 0.9s linear infinite;
}
@keyframes webhook-spin {
  to {
    transform: rotate(360deg);
  }
}

/* ---------- Responsive ---------- */

@media (max-width: 1150px) {
  .overview-grid {
    @apply grid-cols-2;
  }
  .directory-panel {
    @apply min-w-[210px] w-[34%];
    flex-basis: 34%;
  }
  .editor-heading,
  .editor-body,
  .editor-footer {
    @apply px-[17px];
  }
}

@media (min-width: 901px) and (max-height: 620px) {
  .workspace-region {
    @apply static h-auto max-h-none;
  }
  .workspace-layout,
  .history-workspace {
    @apply min-h-0 max-h-none;
    flex: 0 0 auto;
    height: clamp(320px, 62dvh, 560px);
  }
}

@media (max-width: 900px) {
  .webhook-page {
    @apply min-h-0;
    flex: 0 0 auto;
  }
  .webhook-page > :deep(.app-footer) {
    @apply mt-0;
  }
  .workspace-region {
    @apply static h-auto max-h-none;
    flex: 0 0 auto;
  }
  .workspace-layout,
  .history-workspace {
    @apply min-h-0 max-h-none flex-col overflow-visible;
    flex: 0 0 auto;
  }
  .directory-panel,
  .editor-panel,
  .history-panel {
    @apply w-full min-w-0 max-h-none;
  }
  .directory-panel {
    @apply h-[var(--wh-directory-height)];
    flex: 0 0 auto;
  }
  .editor-panel {
    @apply h-[var(--wh-editor-height)];
  }
  .history-workspace {
    @apply flex;
  }
  .history-panel {
    @apply h-[var(--wh-history-height)];
    flex: 0 0 auto;
  }
  .editor-heading,
  .editor-body,
  .editor-footer {
    @apply px-[17px];
  }
}

@media (max-width: 640px) {
  .webhook-page {
    @apply gap-3.5;
    --wh-directory-height: clamp(260px, 42dvh, 440px);
    --wh-editor-height: clamp(320px, 54dvh, 560px);
    --wh-history-height: clamp(280px, 44dvh, 480px);
  }
  .page-intro {
    @apply flex-col items-start gap-[15px] p-5;
  }
  .intro-state {
    @apply box-border w-full;
  }
  .overview-grid {
    @apply gap-[9px];
  }
  .overview-card {
    @apply p-[13px];
  }
  .overview-icon {
    @apply h-[30px] w-[30px];
  }
  .overview-label {
    @apply mt-2.5;
  }
  .overview-value {
    @apply text-[21px];
  }
  .workspace-tabs {
    @apply gap-0.5 overflow-x-auto;
  }
  .workspace-tabs button {
    @apply gap-1.5 px-[9px] text-[10px];
    min-height: 39px;
  }
  .workspace-tabs button > svg {
    @apply hidden;
  }
  .workspace-tabs button.active::after {
    @apply left-2 right-2;
  }
  .editor-heading {
    @apply flex-wrap items-start p-4;
  }
  .editor-title-mark {
    @apply h-9 w-9;
    flex-basis: 36px;
  }
  .editor-heading-tools {
    @apply ml-0 w-full justify-between;
  }
  .editor-body {
    @apply px-4;
  }
  .form-section {
    @apply gap-3.5 py-[18px];
  }
  .field-grid {
    @apply grid-cols-1 gap-3.5;
  }
  .editor-footer {
    @apply gap-[7px] px-4 py-3;
  }
  .editor-footer .footer-spacer {
    @apply hidden;
  }
  .editor-footer :deep(.app-button) {
    @apply flex-auto;
  }
  .editor-footer :deep(.app-button--primary) {
    flex: 1 0 100%;
  }
  .editor-note {
    @apply px-4;
  }
  .inline-empty {
    @apply flex-wrap;
  }
  .panel-heading {
    @apply flex-wrap items-start;
  }
  .panel-heading-copy p {
    @apply whitespace-normal;
  }
  .records-filter {
    @apply w-full;
  }
  .event-row,
  .delivery-row {
    @apply gap-[9px] p-[13px];
  }
}

@media (prefers-reduced-motion: reduce) {
  .webhook-page *,
  .webhook-page *::before,
  .webhook-page *::after {
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
  }
}
</style>
