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
          <div class="eyebrow"><AppIcon name="workflow" :size="14" /> {{ t("notifications.workspace") }}</div>
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
                <AppButton variant="secondary" :disabled="!cid || testingId === cid" @click="testC(channels.find(x => x.id === cid))"><AppIcon :name="testingId === cid ? 'loader-circle' : 'activity'" :size="15" :class="{ spin: testingId === cid }" /> {{ testingId === cid ? t("notifications.buttonTesting") : t("notifications.buttonTest") }}</AppButton>
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
/* ============================================================
   Notification workspace — "quiet console" restyle.

   Layout contract (single owner per scroll region, three tiers):

   1. Pinned tier (desktop, viewport height > 620px):
      the intro and overview bands scroll away; the workspace sticks just
      below the admin header and is exactly the band between the header
      offset and the footer reserve. Tabs stay under the header, the middle
      row stretches with the viewport, and the footer stays visible at the
      bottom. Each panel scrolls only inside its own AppScrollArea.

   2. Shrink tier: while pinned, only the middle row reacts to a shrinking
      viewport. It stops at a 320px floor (the row's min-height) so the
      panels always remain usable.

   3. Flow tier (height < 620px, or width <= 900px): the pinned band can no
      longer honour its floor, so the workspace stops sticking and the whole
      content area scrolls as one document, like the dashboard overview
      page. Panels keep bounded heights so their inner scrollbars survive.

   Scrollbars come exclusively from the shared AppScrollArea component and
   are tuned through its public CSS variables (--scrollbar-size /
   --scrollbar-thumb / --scrollbar-thumb-hover), never with bespoke
   scrollbar markup or duplicated thumb styling.
   ============================================================ */

.webhook-page {
  /* Radius scale: card / panel / item / control. */
  --wh-radius-card: 16px;
  --wh-radius-panel: 14px;
  --wh-radius-item: 11px;
  --wh-radius-control: 10px;

  /* Surfaces. */
  --wh-panel-bg: var(--surface);
  --wh-heading-bg: var(--surface-2);
  --wh-item-hover: color-mix(in srgb, var(--accent) 6%, var(--surface-2));

  /* Shared scrollbar tuning (consumed by AppScrollArea.vue). */
  --scrollbar-size: 10px;
  --scrollbar-thumb: color-mix(in srgb, var(--text) 26%, transparent);
  --scrollbar-thumb-hover: color-mix(in srgb, var(--text) 46%, transparent);

  /* Mobile-only bounded panel heights. */
  --wh-directory-height: clamp(300px, 46dvh, 540px);
  --wh-editor-height: clamp(360px, 56dvh, 680px);
  --wh-history-height: clamp(320px, 50dvh, 620px);

  /* Sticky workspace geometry (desktop).
     --wh-header-gap mirrors the 25px offset the admin layout uses between
     the topbar and page content, so the pinned tabs sit exactly where they
     would in normal flow.
     --wh-footer-reserve must stay BELOW the real space under the region
     (page gap 18 + footer ~53 + page bottom padding 40 = ~111). The slack
     (111 - reserve) is exactly the scroll distance during which the region
     is genuinely pinned, so a larger reserve silently kills the pin. */
  --wh-header-gap: 25px;
  --wh-footer-reserve: 100px;

  display: flex;
  /* Content-sized on purpose: the sticky workspace travels inside this box,
     so clamping it to the viewport height would clamp the pin too. */
  flex: 0 0 auto;
  flex-direction: column;
  gap: clamp(12px, 1.35vw, 18px);
  width: 100%;
  min-width: 0;
  min-height: 0;
  box-sizing: border-box;
  color: var(--text);
}

.webhook-page > :deep(.app-footer) {
  flex: 0 0 auto;
  /* The footer is a fixed band of the page column: the workspace above it
     takes the remaining space, so the footer can never be pushed under the
     workshop panels (no auto margin — that reintroduced the gap the flex
     chain is supposed to own). */
  margin-top: 0;
}

/* ---------- Page intro ---------- */

.page-intro,
.overview-grid {
  flex: 0 0 auto;
}

.page-intro {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 23px 26px;
  border: 1px solid color-mix(in srgb, var(--accent) 14%, var(--line));
  border-radius: var(--wh-radius-card);
  background:
    radial-gradient(120% 160% at 0% 0%, color-mix(in srgb, var(--accent) 9%, transparent), transparent 55%),
    var(--wh-panel-bg);
  box-shadow: var(--shadow);
  overflow: hidden;
}

.page-intro::before {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 3px;
  background: linear-gradient(180deg, var(--accent), color-mix(in srgb, var(--accent) 30%, transparent));
  content: "";
}

.intro-copy {
  min-width: 0;
}

.eyebrow,
.editor-kicker {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--accent);
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.13em;
}

.page-intro h2 {
  margin: 9px 0 5px;
  font-size: clamp(20px, 2vw, 25px);
  line-height: 1.2;
  letter-spacing: -0.035em;
}

.page-intro p {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.6;
}

.intro-state {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 11px;
  padding: 12px 15px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--wh-heading-bg);
}

.intro-state strong,
.intro-state small {
  display: block;
}

.intro-state strong {
  font-size: 11px;
}

.intro-state small {
  margin-top: 4px;
  color: var(--muted);
  font-size: 10px;
}

.state-dot {
  display: inline-block;
  flex: 0 0 7px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--muted);
}

.state-dot.online {
  background: var(--green);
  box-shadow: 0 0 0 3px var(--green-soft);
}

/* ---------- Overview cards ---------- */

.overview-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.overview-card {
  min-width: 0;
  padding: 15px 17px 14px;
  border: 1px solid var(--line);
  border-radius: var(--wh-radius-panel);
  background: var(--wh-panel-bg);
  box-shadow: var(--shadow);
  transition: border-color 160ms ease, transform 160ms ease, box-shadow 160ms ease;
}

.overview-card:hover {
  border-color: color-mix(in srgb, var(--accent) 26%, var(--line));
  box-shadow:
    0 2px 4px color-mix(in srgb, var(--text) 5%, transparent),
    0 10px 22px color-mix(in srgb, var(--text) 5%, transparent);
  transform: translateY(-1px);
}

.overview-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.overview-icon {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border: 1px solid var(--line);
  border-radius: var(--wh-radius-control);
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
  margin-top: 12px;
  color: var(--muted);
  font-size: 11px;
}

.overview-value {
  font-size: 24px;
  font-weight: 800;
  line-height: 1.25;
  letter-spacing: -0.04em;
  font-variant-numeric: tabular-nums;
}

.overview-value span {
  color: var(--muted);
  font-size: 13px;
  font-weight: 550;
  letter-spacing: 0;
}

.overview-foot {
  margin-top: 5px;
  color: var(--muted);
  font-size: 10px;
  line-height: 1.4;
}

/* ---------- Loading / error states ---------- */

.state-panel {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  gap: 11px;
  min-height: 120px;
  padding: 24px;
  border: 1px solid var(--line);
  border-radius: var(--wh-radius-panel);
  background: var(--wh-panel-bg);
  color: var(--muted);
  font-size: 12px;
}

.state-error { justify-content: flex-start; color: var(--red); }
.state-error div { flex: 1 1 auto; min-width: 0; }
.state-error strong { font-size: 12px; }
.state-error p { margin: 5px 0 0; color: var(--muted); font-size: 11px; overflow-wrap: anywhere; }

/* ---------- Workspace frame (header-anchored sticky) ---------- */

/*
   Desktop scroll model: the intro and overview bands scroll away with the
   document, while the workspace region sticks into the band between the
   admin header and the footer. Once the page reaches its bottom, the
   viewport shows exactly header → tabs → left/right panels → footer. The
   sticky top keeps the same 25px rhythm as the page's natural content
   offset below the header, so the gap never changes between free scroll
   and the pinned state. The workspace height is derived from 100dvh minus
   the header band and the footer reserve, so it adapts to any display
   size; the two columns each own an independent AppScrollArea scrollbar.
*/
.workspace-region {
  position: sticky;
  z-index: 1;
  top: calc(var(--admin-topbar-space, 104px) + var(--wh-header-gap, 25px));
  display: flex;
  /* Pinned tier: the region is exactly the band between the header offset
     and the footer reserve, so the middle row stretches/shrinks with the
     viewport while the footer always stays visible at the scroll bottom.
     The height is explicit (not flex-grown) because the page column is
     content-sized; a flex basis would not track the viewport. */
  flex: 0 0 auto;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  min-width: 0;
  min-height: 0;
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
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 4px;
  padding: 4px;
  border: 1px solid var(--line);
  border-radius: 13px;
  background: var(--wh-heading-bg);
}

.workspace-tabs button {
  position: relative;
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 8px;
  min-height: 42px;
  padding: 0 15px;
  border: 1px solid transparent;
  border-radius: var(--wh-radius-control);
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
  transition: color 150ms ease, background 150ms ease, border-color 150ms ease;
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
  position: absolute;
  right: 12px;
  bottom: -1px;
  left: 12px;
  height: 2px;
  border-radius: 2px 2px 0 0;
  background: var(--accent);
  content: "";
}

.tab-count,
.tab-alert {
  display: inline-grid;
  place-items: center;
  min-width: 20px;
  height: 20px;
  padding: 0 5px;
  border-radius: 6px;
  font-size: 10px;
  font-variant-numeric: tabular-nums;
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

/* The layout row is capped by the workspace height, so its panels can use
   max-height:100% reliably on desktop. The 320px floor keeps panels usable
   on very short viewports: beyond that the admin viewport scrolls instead
   of crushing the editor. */
.workspace-layout,
.history-workspace {
  display: flex;
  flex: 1 1 0%;
  align-items: stretch;
  gap: 14px;
  width: 100%;
  min-width: 0;
  min-height: 320px;
  max-height: 100%;
  overflow: hidden;
}

/* ---------- Panels: "header band + scroll body (+ footer)" ----------
   Every workspace panel uses the same skeleton. The header and the optional
   footer are fixed bands that belong to the whole panel; only the body is a
   scroll owner (AppScrollArea), so a panel's scrollbar never runs under its
   own title. */

.directory-panel,
.editor-panel,
.history-panel {
  display: flex;
  flex: 1 1 0%;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  max-height: 100%;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: var(--wh-radius-panel);
  background: var(--wh-panel-bg);
  box-shadow: var(--shadow);
}

/* Header band — reads as the panel's own title, not as the first row. */
.panel-heading {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 11px;
  padding: 13px 15px;
  border-bottom: 1px solid color-mix(in srgb, var(--accent) 16%, var(--line));
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--accent) 8%, var(--surface-2)),
    var(--wh-heading-bg)
  );
}

.panel-heading-icon {
  display: grid;
  flex: 0 0 30px;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 1px solid color-mix(in srgb, var(--accent) 22%, var(--line));
  border-radius: 9px;
  background: var(--accent-soft);
  color: var(--accent);
}

.panel-heading-copy {
  display: grid;
  flex: 1 1 auto;
  gap: 3px;
  min-width: 0;
}

.panel-heading-copy h3 {
  margin: 0;
  font-size: 12.5px;
  font-weight: 780;
  letter-spacing: -0.01em;
}

.panel-heading-copy p {
  margin: 0;
  color: var(--muted);
  font-size: 10px;
  line-height: 1.45;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Scroll body — the single scroll owner inside a panel. */
.panel-scroll {
  flex: 1 1 0%;
  width: 100%;
  min-width: 0;
  min-height: 0;
}

.panel-scroll :deep(.app-scroll-area-viewport) {
  height: 100%;
}

/* Footer band (optional) — status/summary strip, never scrolls. */
.panel-footer {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 8px;
  padding: 10px 15px;
  border-top: 1px solid var(--line);
  background: var(--wh-heading-bg);
  color: var(--muted);
  font-size: 10px;
}

/* ---------- Directory panel (channels / rules list) ---------- */

.directory-panel {
  flex: 0 0 min(32%, 340px);
  width: min(32%, 340px);
  border-color: color-mix(in srgb, var(--accent) 12%, var(--line));
}

.directory-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  width: calc(100% - 16px);
  margin: 4px 8px;
  padding: 9px 10px;
  border: 1px solid transparent;
  border-radius: var(--wh-radius-item);
  background: transparent;
  color: var(--text);
  text-align: left;
  cursor: pointer;
  transition: background 150ms ease, border-color 150ms ease, box-shadow 150ms ease;
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

/* Quick delete — revealed on hover / keyboard focus so the row stays calm at
   rest, and always available on touch devices that cannot hover. Visuals come
   from AppIconButton; this block only controls the reveal behaviour. */
.row-delete {
  opacity: 0;
  pointer-events: none;
  transition: opacity 140ms ease;
}

.directory-item:hover .row-delete,
.directory-item:focus-within .row-delete,
.row-delete:focus-visible {
  opacity: 1;
  pointer-events: auto;
}

@media (hover: none) {
  .row-delete {
    opacity: 1;
    pointer-events: auto;
  }
}

@media (hover: none) {
  .row-delete {
    opacity: 1;
    pointer-events: auto;
  }
}

.provider-icon {
  display: grid;
  flex: 0 0 34px;
  place-items: center;
  width: 34px;
  height: 34px;
  border: 1px solid var(--line);
  border-radius: var(--wh-radius-control);
  background: var(--wh-heading-bg);
  color: var(--accent);
}

.directory-content {
  display: grid;
  flex: 1 1 auto;
  gap: 4px;
  min-width: 0;
}

.directory-content strong,
.directory-content small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.directory-content strong {
  color: var(--text);
  font-size: 11px;
  font-weight: 720;
}

.directory-content small {
  color: var(--muted);
  font-size: 10px;
  line-height: 1.4;
}

.directory-content .url-preview {
  font-family: var(--font-mono);
  font-size: 9px;
  opacity: 0.85;
}

.empty-directory,
.empty-history {
  display: flex;
  align-items: center;
  flex-direction: column;
  gap: 8px;
  padding: 28px 20px;
  text-align: center;
}

.empty-icon,
.placeholder-icon {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  margin-bottom: 3px;
  border: 1px solid var(--line);
  border-radius: 13px;
  background: var(--wh-heading-bg);
  color: var(--muted);
}

.empty-directory strong,
.empty-history strong { font-size: 12px; }

.empty-directory p,
.empty-history p {
  max-width: 260px;
  margin: 0 0 6px;
  color: var(--muted);
  font-size: 10px;
  line-height: 1.6;
}

/* ---------- Editor panel ---------- */

.editor-panel {
  display: flex;
  flex: 1 1 0%;
  flex-direction: column;
  width: 0;
  height: 100%;
  max-height: 100%;
}

.editor-heading {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 13px;
  padding: 20px 23px;
  border-bottom: 1px solid var(--line);
  background: var(--wh-heading-bg);
}

.editor-title-mark {
  display: grid;
  flex: 0 0 42px;
  place-items: center;
  width: 42px;
  height: 42px;
  border: 1px solid color-mix(in srgb, var(--accent) 22%, var(--line));
  border-radius: 12px;
  background: var(--accent-soft);
  color: var(--accent);
}

.editor-heading-copy {
  flex: 1 1 auto;
  min-width: 0;
}

.editor-heading-tools {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-left: auto;
}

.editor-heading h3 {
  margin: 4px 0;
  font-size: 15px;
  font-weight: 790;
  letter-spacing: -0.02em;
}

.editor-heading p {
  margin: 0;
  color: var(--muted);
  font-size: 10px;
  line-height: 1.5;
}

.editor-scroll {
  display: block;
  flex: 1 1 0%;
  width: 100%;
  min-width: 0;
  min-height: 0;
  max-height: 100%;
  overflow: hidden;
}

.editor-scroll :deep(.app-scroll-area-viewport) {
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-gutter: stable;
}

/* ---------- Forms ---------- */

.status-pill {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 7px;
  padding: 6px 9px;
  border: 1px solid var(--line);
  border-radius: 20px;
  background: var(--wh-panel-bg);
  color: var(--muted);
  font-size: 10px;
  font-weight: 650;
  white-space: nowrap;
}

.pill-enabled {
  border-color: color-mix(in srgb, var(--green) 24%, var(--line));
  background: var(--green-soft);
  color: var(--green);
}

.pill-disabled { color: var(--muted); }

.editor-body {
  display: grid;
  align-content: start;
  gap: 0;
  padding: 0 23px;
}

.form-section {
  display: grid;
  gap: 17px;
  padding: 22px 0 24px;
  border-bottom: 1px solid var(--line);
}

.form-section:last-child { border-bottom: 0; }

.section-title {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.section-title > span {
  display: grid;
  flex: 0 0 27px;
  place-items: center;
  width: 27px;
  height: 27px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--wh-heading-bg);
  color: var(--muted);
  font-size: 10px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.section-title h4 { margin: 1px 0 4px; font-size: 12px; font-weight: 760; }
.section-title p { margin: 0; color: var(--muted); font-size: 10px; line-height: 1.5; }

.field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.field {
  display: grid;
  gap: 7px;
  min-width: 0;
  color: var(--text);
  font-size: 11px;
  font-weight: 680;
}

.field > span:first-child {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px;
}

.field i { color: var(--red); font-style: normal; }
.field em { color: var(--muted); font-size: 10px; font-weight: 500; font-style: normal; }

.field :deep(.CodeMirror),
.field :deep(.app-select) {
  width: 100%;
  min-width: 0;
}

.field :deep(.CodeMirror) { border-radius: var(--wh-radius-control); }

.field-hint {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 0;
  color: var(--muted);
  font-size: 10px;
  font-weight: 450;
  line-height: 1.55;
}

.field-hint code {
  padding: 1px 4px;
  border-radius: 4px;
  background: var(--wh-heading-bg);
  font-family: var(--font-mono);
  font-size: 9px;
}

.secret-input { display: flex; gap: 7px; min-width: 0; }
.secret-input input { flex: 1; min-width: 0; }

.field-static {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 41px;
  padding: 0 11px;
  border: 1px solid var(--line);
  border-radius: var(--wh-radius-control);
  background: var(--wh-heading-bg);
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 500;
}

.editor-footer {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 14px 23px;
  border-top: 1px solid var(--line);
  background: var(--wh-heading-bg);
}

.footer-spacer { flex: 1 1 auto; }

.editor-note {
  display: flex;
  flex: 0 0 auto;
  align-items: flex-start;
  gap: 8px;
  padding: 11px 23px 15px;
  border-top: 1px solid color-mix(in srgb, var(--red) 16%, var(--line));
  background: color-mix(in srgb, var(--red-soft) 55%, var(--wh-panel-bg));
  color: var(--muted);
  font-size: 10px;
  line-height: 1.5;
}

.editor-note :deep(svg) { color: var(--red); }

.workspace-tabs button:focus-visible,
.directory-item:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

/* ---------- Rules: channel multi-select ---------- */

.condition-hint {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--accent) 20%, var(--line));
  border-radius: var(--wh-radius-item);
  background: var(--accent-soft);
  color: var(--accent);
}

.condition-hint strong { font-size: 11px; }
.condition-hint p { margin: 4px 0 0; color: var(--text); font-size: 10px; line-height: 1.55; }
.channel-options { display: grid; gap: 8px; }

.channel-option {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: var(--wh-radius-item);
  background: var(--wh-panel-bg);
  cursor: pointer;
  transition: background 150ms ease, border-color 150ms ease, box-shadow 150ms ease;
}

.channel-option:hover { background: var(--wh-item-hover); }

.channel-option.checked {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--line));
  background: var(--accent-soft);
  box-shadow: inset 3px 0 0 var(--accent);
}

.channel-option.unavailable { opacity: 0.55; cursor: not-allowed; }

.option-icon {
  display: grid;
  flex: 0 0 33px;
  place-items: center;
  width: 33px;
  height: 33px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: var(--wh-panel-bg);
  color: var(--accent);
}

.option-copy { display: grid; flex: 1 1 auto; min-width: 0; gap: 4px; }
.option-copy strong { font-size: 11px; overflow-wrap: anywhere; }
.option-copy small { color: var(--muted); font-size: 10px; }
.option-check { color: var(--accent); }

.inline-empty {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 13px;
  border: 1px dashed var(--line);
  border-radius: var(--wh-radius-item);
  color: var(--muted);
}

.inline-empty div { flex: 1 1 auto; min-width: 0; }
.inline-empty strong { color: var(--text); font-size: 11px; }
.inline-empty p { margin: 4px 0 0; font-size: 10px; line-height: 1.5; }

/* ---------- Records table ---------- */

.history-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
}

.records-body {
  display: grid;
  flex: 1 1 0%;
  grid-template-rows: minmax(0, 1fr);
  min-height: 0;
}

.record-row {
  cursor: pointer;
  transition: background 140ms ease;
}

.record-row:hover {
  background: var(--wh-item-hover);
}

.record-row:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.cell-strong { font-weight: 620; }
.cell-muted { color: var(--muted); }
.nowrap { white-space: nowrap; }

.row-open-hint {
  color: var(--muted);
  font-size: 10px;
  white-space: nowrap;
}

/* ---------- Notification detail dialog ---------- */

.dialog-title {
  margin: 4px 0 2px;
  font-size: 17px;
  font-weight: 780;
}

.dialog-sub {
  margin: 0;
  color: var(--muted);
  font-size: 11px;
}

.record-detail {
  display: grid;
  gap: 16px;
}

.record-detail-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 13px 18px;
}

.record-detail-grid > div {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.record-detail-grid span {
  color: var(--muted);
  font-size: 10px;
}

.record-detail-grid strong {
  font-size: 12px;
  overflow-wrap: anywhere;
}

.record-detail-block {
  display: grid;
  gap: 8px;
  padding-top: 13px;
  border-top: 1px solid var(--line);
}

.record-detail-block h3 {
  margin: 0;
  font-size: 11px;
  font-weight: 720;
}

.record-detail-block p {
  margin: 0;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.record-detail-block pre {
  margin: 0;
  padding: 10px;
  border-radius: 8px;
  background: var(--red-soft);
  color: var(--red);
  font-family: var(--font-mono);
  font-size: 10px;
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.record-detail-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.neutral-count {
  padding: 5px 8px;
  border: 1px solid var(--line);
  border-radius: 7px;
  color: var(--muted);
  font-size: 10px;
  white-space: nowrap;
}

.event-row,
.delivery-row {
  display: flex;
  align-items: flex-start;
  gap: 11px;
  padding: 15px 19px;
  border-top: 1px solid var(--line);
  transition: background 150ms ease;
}

.event-row:hover,
.delivery-row:hover {
  background: var(--wh-item-hover);
}

.timeline-marker,
.delivery-status-icon {
  display: grid;
  flex: 0 0 32px;
  place-items: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--line);
  border-radius: var(--wh-radius-control);
  background: var(--wh-heading-bg);
  color: var(--muted);
}

.event-row:has(.outcome-failure) .timeline-marker {
  border-color: color-mix(in srgb, var(--red) 20%, var(--line));
  background: var(--red-soft);
  color: var(--red);
}

.history-row-content { flex: 1 1 auto; min-width: 0; }
.history-row-title { display: flex; align-items: center; flex-wrap: wrap; gap: 7px; }
.history-row-title strong { font-size: 11px; }

.history-row-content > p {
  margin: 6px 0;
  color: var(--muted);
  font-size: 10px;
  line-height: 1.55;
  overflow-wrap: anywhere;
}

.history-row-content > small { color: var(--muted); font-size: 9px; line-height: 1.5; }

.phase-tag,
.outcome-tag {
  display: inline-flex;
  align-items: center;
  padding: 3px 6px;
  border-radius: 5px;
  background: var(--wh-heading-bg);
  color: var(--muted);
  font-size: 9px;
  white-space: nowrap;
}

.outcome-success { background: var(--green-soft); color: var(--green); }
.outcome-failure { background: var(--red-soft); color: var(--red); }

.delivery-succeeded { border-color: color-mix(in srgb, var(--green) 22%, var(--line)); background: var(--green-soft); color: var(--green); }
.delivery-failed { border-color: color-mix(in srgb, var(--red) 22%, var(--line)); background: var(--red-soft); color: var(--red); }
.delivery-sending { background: var(--accent-soft); color: var(--accent); }

.small-pill { padding: 4px 7px; font-size: 9px; }
.delivery-pill-succeeded { border-color: color-mix(in srgb, var(--green) 22%, var(--line)); background: var(--green-soft); color: var(--green); }
.delivery-pill-failed { border-color: color-mix(in srgb, var(--red) 22%, var(--line)); background: var(--red-soft); color: var(--red); }

.records-filter {
  flex: 0 0 auto;
  width: 148px;
}

.delivery-error { padding: 8px 9px; border-radius: 7px; background: var(--red-soft); color: var(--red) !important; }

/* ---------- Editor placeholder ---------- */

.editor-placeholder {
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 28px;
  text-align: center;
  color: var(--muted);
}

.editor-placeholder p { margin: 0; font-size: 13px; line-height: 1.7; }

.spin { animation: webhook-spin 0.9s linear infinite; }
@keyframes webhook-spin { to { transform: rotate(360deg); } }

/* ---------- Responsive ---------- */

@media (max-width: 1150px) {
  .overview-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .directory-panel { flex-basis: 34%; width: 34%; min-width: 210px; }
  .editor-heading { padding-right: 17px; padding-left: 17px; }
  .editor-body { padding-right: 17px; padding-left: 17px; }
  .editor-footer { padding-right: 17px; padding-left: 17px; }
}

/* Short-viewport fallback (wide screens only — the narrow layout below has
   its own bounded-panel model). The pinned tier needs, at minimum, the
   topbar + header gap + tabs + 12px gap + the 320px row floor + the footer
   reserve, which lands at roughly 620px of viewport height. Below that the
   pinned layout could no longer honour its floor, so the workspace stops
   sticking and the whole content area scrolls as one document, exactly
   like the dashboard overview page. Keeping the switch here also prevents
   the footer from ever being pushed under the panels. */
@media (min-width: 901px) and (max-height: 620px) {
  .workspace-region {
    position: static;
    height: auto;
    max-height: none;
  }

  .workspace-layout,
  .history-workspace {
    flex: 0 0 auto;
    /* Same 320px floor as the pinned tier, so the row stops shrinking at the
       same point in both tiers; below that the document scrolls instead. */
    height: clamp(320px, 62dvh, 560px);
    min-height: 0;
    max-height: none;
  }
}

@media (max-width: 900px) {
  /* Natural document flow: the admin viewport owns page scrolling, the
     sticky workspace is released, and each panel becomes its own
     height-bounded scroll owner. */
  .webhook-page {
    flex: 0 0 auto;
    min-height: 0;
  }

  .webhook-page > :deep(.app-footer) {
    margin-top: 0;
  }

  .workspace-region {
    position: static;
    flex: 0 0 auto;
    height: auto;
    max-height: none;
  }

  .workspace-layout,
  .history-workspace {
    flex: 0 0 auto;
    flex-direction: column;
    min-height: 0;
    max-height: none;
    overflow: visible;
  }

  .directory-panel,
  .editor-panel,
  .history-panel {
    max-height: none;
    width: 100%;
    min-width: 0;
  }

  .directory-panel {
    flex: 0 0 auto;
    height: var(--wh-directory-height);
  }

  .editor-panel {
    height: var(--wh-editor-height);
  }

  .history-workspace { display: flex; }

  .history-panel {
    flex: 0 0 auto;
    height: var(--wh-history-height);
  }

  .editor-heading { padding-right: 17px; padding-left: 17px; }
  .editor-body { padding-right: 17px; padding-left: 17px; }
  .editor-footer { padding-right: 17px; padding-left: 17px; }
}

@media (max-width: 640px) {
  .webhook-page {
    gap: 14px;
    --wh-directory-height: clamp(260px, 42dvh, 440px);
    --wh-editor-height: clamp(320px, 54dvh, 560px);
    --wh-history-height: clamp(280px, 44dvh, 480px);
  }

  .page-intro {
    align-items: flex-start;
    flex-direction: column;
    gap: 15px;
    padding: 20px;
  }

  .intro-state { width: 100%; box-sizing: border-box; }
  .overview-grid { gap: 9px; }
  .overview-card { padding: 13px; }
  .overview-icon { width: 30px; height: 30px; }
  .overview-label { margin-top: 10px; }
  .overview-value { font-size: 21px; }
  .workspace-tabs { gap: 2px; overflow-x: auto; }
  .workspace-tabs button { min-height: 39px; padding: 0 9px; gap: 6px; font-size: 10px; }
  .workspace-tabs button > svg { display: none; }
  .workspace-tabs button.active::after { right: 8px; left: 8px; }
  .editor-heading { align-items: flex-start; flex-wrap: wrap; padding: 16px; }
  .editor-title-mark { flex-basis: 36px; width: 36px; height: 36px; }
  .editor-heading-tools { width: 100%; justify-content: space-between; margin-left: 0; }
  .editor-body { padding: 0 16px; }
  .form-section { gap: 14px; padding: 18px 0; }
  .field-grid { grid-template-columns: minmax(0, 1fr); gap: 14px; }
  .editor-footer { gap: 7px; padding: 12px 16px; }
  .editor-footer .footer-spacer { display: none; }
  .editor-footer :deep(.app-button) { flex: 1 1 auto; }
  .editor-footer :deep(.app-button--primary) { flex: 1 0 100%; }
  .editor-note { padding-right: 16px; padding-left: 16px; }
  .inline-empty { flex-wrap: wrap; }
  .panel-heading { align-items: flex-start; flex-wrap: wrap; }
  .panel-heading-copy p { white-space: normal; }
  .records-filter { width: 100%; }
  .event-row,
  .delivery-row { gap: 9px; padding: 13px; }
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
