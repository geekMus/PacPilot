<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import AdminLayout from "@/components/layout/AdminLayout.vue";
import AppIcon from "@/components/AppIcon.vue";
import AppFooter from "@/components/AppFooter.vue";
import AppScrollArea from "@/components/AppScrollArea.vue";
import CodeMirrorField from "@/components/CodeMirrorField.vue";
import WebhookBodyEditor from "@/features/webhooks/components/WebhookBodyEditor.vue";
import { api, type NotificationChannel, type NotificationRule, type WebhookConfig } from "@/api/client";
import { useToast } from "@/composables/useToast";

type ViewTab = "channels" | "rules" | "history";
const { t } = useI18n();
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
const evName = (v: string) => catalog.value.find((x) => x.type === v)?.label ?? v;
const phaseName = (v: string) => ({ started: "开始时", finished: "结束时", state_changed: "状态变化时", progress: "执行中" } as Record<string, string>)[v] ?? v;
const outcomeName = (v?: string | null) => ({ success: "成功", failure: "失败", cancelled: "已取消", timeout: "超时", unknown: "未知", any: "不限制" } as Record<string, string>)[v ?? "any"] ?? "不限制";
const channelName = (id: string) => channels.value.find((x) => x.id === id)?.name ?? id;
const providerName = (provider: string) => provider === "dingtalk" ? "钉钉机器人" : "HTTP Webhook";
const statusName = (status: string) => ({ succeeded: "已送达", pending: "等待发送", sending: "发送中", failed: "发送失败" } as Record<string, string>)[status] ?? status;
const statusIcon = (status: string): "circle-check" | "clock" | "loader-circle" | "circle-alert" => ({ succeeded: "circle-check", pending: "clock", sending: "loader-circle", failed: "circle-alert" } as Record<string, "circle-check" | "clock" | "loader-circle" | "circle-alert">)[status] ?? "clock";
const formatDate = (value?: string) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
};
const shortUrl = (value: string) => value.replace(/^https?:\/\//, "").replace(/\?.*$/, "");
const phaseDescription = computed(() => rule.phase === "started" ? "任务开始时立即触发，不需要等待执行结果。" : rule.phase === "finished" ? "任务结束后，根据最终执行结果决定是否发送。" : rule.phase === "state_changed" ? "当对象状态发生变化时触发。" : "任务执行过程中触发。");

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
    notify("通知渠道已保存", "success");
  } catch (e) {
    notify(e instanceof Error ? e.message : String(e), "error");
  } finally {
    busy.value = false;
  }
}
async function deleteC(item: NotificationChannel) {
  if (!confirm("确定删除通知渠道“" + item.name + "”？被规则引用的渠道无法删除。")) return;
  try {
    await api.deleteNotificationChannel(item.id);
    if (cid.value === item.id) resetC();
    await load({ preserveView: true });
    notify("通知渠道已删除", "success");
  } catch (e) {
    notify(e instanceof Error ? e.message : String(e), "error");
  }
}
async function testC(item: NotificationChannel) {
  testingId.value = item.id;
  try {
    const result = await api.testNotificationChannel(item.id);
    notify(result.success ? "测试通知已被接受" : result.message, result.success ? "success" : "error");
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
    notify("通知规则已保存", "success");
  } catch (e) {
    notify(e instanceof Error ? e.message : String(e), "error");
  } finally {
    busy.value = false;
  }
}
async function deleteR(item: NotificationRule) {
  if (!confirm("确定删除通知规则“" + item.name + "”？")) return;
  try {
    await api.deleteNotificationRule(item.id);
    if (rid.value === item.id) resetR();
    await load({ preserveView: true });
    notify("通知规则已删除", "success");
  } catch (e) {
    notify(e instanceof Error ? e.message : String(e), "error");
  }
}
async function retry(id: string) {
  try {
    await api.retryNotificationDelivery(id);
    await load({ preserveView: true });
    notify("已重新提交投递", "success");
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
          <div class="eyebrow"><AppIcon name="workflow" :size="14" /> NOTIFICATION WORKSPACE</div>
          <h2>通知工作台</h2>
          <p>从业务事件到通知投递，一处管理渠道、触发规则与发送记录。</p>
        </div>
        <div class="intro-state">
          <span class="state-dot" :class="{ online: enabledChannels.length > 0 && enabledRules.length > 0 }"></span>
          <div><strong>{{ enabledChannels.length && enabledRules.length ? "通知规则已配置" : "完成基础配置以启用通知" }}</strong><small>事件驱动 · 多渠道投递</small></div>
        </div>
      </section>

      <section class="overview-grid" aria-label="通知概览">
        <article class="overview-card">
          <div class="overview-top">
            <span class="overview-icon channel-icon"><AppIcon name="network" :size="18" /></span>
            <div class="overview-value">{{ enabledChannels.length }}<span> / {{ channels.length }}</span></div>
          </div>
          <div class="overview-label">通知渠道</div>
          <div class="overview-foot">已启用渠道</div>
        </article>
        <article class="overview-card">
          <div class="overview-top">
            <span class="overview-icon rule-icon"><AppIcon name="route" :size="18" /></span>
            <div class="overview-value">{{ enabledRules.length }}<span> / {{ rules.length }}</span></div>
          </div>
          <div class="overview-label">生效规则</div>
          <div class="overview-foot">按事件条件自动匹配</div>
        </article>
        <article class="overview-card">
          <div class="overview-top">
            <span class="overview-icon delivery-icon"><AppIcon name="activity" :size="18" /></span>
            <div class="overview-value">{{ pendingDeliveries.length }}</div>
          </div>
          <div class="overview-label">等待投递</div>
          <div class="overview-foot">待发送或正在发送</div>
        </article>
        <article class="overview-card" :class="{ 'has-failures': failedDeliveries.length > 0 }">
          <div class="overview-top">
            <span class="overview-icon failure-icon"><AppIcon name="circle-alert" :size="18" /></span>
            <div class="overview-value">{{ failedDeliveries.length }}</div>
          </div>
          <div class="overview-label">投递失败</div>
          <div class="overview-foot">{{ failedDeliveries.length ? "需要检查或重新发送" : "当前没有失败投递" }}</div>
        </article>
      </section>

      <p v-if="loading" class="state-panel"><AppIcon name="loader-circle" :size="18" class="spin" /> 正在加载通知配置…</p>
      <section v-else-if="error" class="state-panel state-error">
        <AppIcon name="circle-alert" :size="20" /><div><strong>暂时无法加载通知配置</strong><p>{{ error }}</p></div><button class="button secondary" @click="load()">重试</button>
      </section>
      <template v-else>
        <section class="workspace-region">
          <nav class="workspace-tabs" aria-label="通知管理分类">
            <button :class="{ active: tab === 'channels' }" @click="tab = 'channels'">
              <AppIcon name="network" :size="16" /> 通知渠道 <span class="tab-count">{{ channels.length }}</span>
            </button>
            <button :class="{ active: tab === 'rules' }" @click="tab = 'rules'">
              <AppIcon name="route" :size="16" /> 触发规则 <span class="tab-count">{{ rules.length }}</span>
            </button>
            <button :class="{ active: tab === 'history' }" @click="tab = 'history'">
              <AppIcon name="activity" :size="16" /> 事件与投递 <span class="tab-count">{{ deliveries.length }}</span>
              <span v-if="failedDeliveries.length" class="tab-alert">{{ failedDeliveries.length }}</span>
            </button>
          </nav>

          <section v-if="tab === 'channels'" class="workspace-layout">
            <AppScrollArea root-class="directory-panel" type="always">
              <div class="panel-heading">
                <div><h3>通知渠道</h3><p>保存可复用的通知目标</p></div>
                <button class="icon-button" title="新建渠道" aria-label="新建渠道" @click="resetC">＋</button>
              </div>
              <div v-if="!channels.length" class="empty-directory">
                <span class="empty-icon"><AppIcon name="network" :size="22" /></span>
                <strong>还没有通知渠道</strong><p>添加钉钉机器人或 HTTP Webhook，供规则调用。</p>
                <button class="button primary full" @click="resetC">创建第一个渠道</button>
              </div>
              <button v-for="item in channels" :key="item.id" class="directory-item" :class="{ selected: cid === item.id }" @click="editC(item)">
                <span class="provider-icon"><AppIcon :name="item.provider === 'dingtalk' ? 'bell-ring' : 'globe'" :size="18" /></span>
                <span class="directory-content"><strong>{{ item.name }}</strong><small>{{ providerName(item.provider) }}</small><small class="url-preview">{{ shortUrl(item.config.url) || "尚未配置 URL" }}</small></span>
                <span class="status-dot" :class="{ online: item.enabled }" :title="item.enabled ? '已启用' : '已停用'"></span>
              </button>
              <div v-if="channels.length" class="directory-bottom"><span class="status-dot online"></span> {{ enabledChannels.length }} 个渠道已启用</div>
            </AppScrollArea>

            <form v-if="channelEditorOpen" class="editor-panel" @submit.prevent="saveC">
              <header class="editor-heading">
                <div class="editor-title-mark"><AppIcon name="network" :size="19" /></div>
                <div class="editor-heading-copy"><div class="editor-kicker">{{ cid ? "CHANNEL SETTINGS" : "NEW CHANNEL" }}</div><h3>{{ cid ? "编辑通知渠道" : "创建通知渠道" }}</h3><p>配置接收通知的目标地址和消息格式。</p></div>
                <div class="editor-heading-tools"><span class="status-pill" :class="ch.enabled ? 'pill-enabled' : 'pill-disabled'"><span class="status-dot" :class="{ online: ch.enabled }"></span>{{ ch.enabled ? "已启用" : "已停用" }}</span></div>
              </header>
              <AppScrollArea root-class="editor-scroll" type="always"><div class="editor-body">
                <section class="form-section">
                  <div class="section-title"><span>01</span><div><h4>基本信息</h4><p>为渠道命名并选择接入类型。</p></div></div>
                  <div class="field-grid">
                    <label class="field"><span>渠道名称 <i>*</i></span><input v-model="ch.name" required maxlength="80" placeholder="例如：生产环境钉钉群" /></label>
                    <label class="field"><span>通知类型 <i>*</i></span><select v-model="ch.config.provider"><option value="dingtalk">钉钉机器人</option><option value="custom">通用 HTTP Webhook</option></select></label>
                  </div>
                </section>

                <section class="form-section">
                  <div class="section-title"><span>02</span><div><h4>连接配置</h4><p>通知目标的地址和身份验证信息。</p></div></div>
                  <label class="field">
                    <span>Webhook URL <i>*</i></span>
                    <CodeMirrorField :model-value="ch.config.url" single-line :height="42" language="text" aria-label="Webhook URL" :placeholder="ch.config.provider === 'dingtalk' ? 'https://oapi.dingtalk.com/robot/send?access_token=…' : 'https://example.com/hooks/pacpilot'" @update:model-value="ch.config.url = $event" />
                    <small class="field-hint"><AppIcon name="shield-check" :size="13" /> URL 中的敏感参数会在页面和日志中脱敏。</small>
                  </label>
                  <template v-if="ch.config.provider === 'dingtalk'">
                    <label class="field">
                      <span>加签密钥 <em>可选</em></span>
                      <div class="secret-input"><input v-model="ch.config.dingTalkSecret" :type="showSecret ? 'text' : 'password'" autocomplete="new-password" :placeholder="cid && channels.find(x => x.id === cid)?.hasSecret ? '已保存密钥，留空则保持不变' : '如果启用了加签，请填写密钥'" /><button type="button" class="reveal-button" :aria-label="showSecret ? '隐藏密钥' : '显示密钥'" @click="showSecret = !showSecret"><AppIcon :name="showSecret ? 'eye-off' : 'eye'" :size="16" /></button></div>
                      <small class="field-hint">出于安全考虑，已保存的密钥不会回显。</small>
                    </label>
                    <label class="field"><span>消息格式</span><select v-model="ch.config.dingTalkMessageType"><option value="text">纯文本</option><option value="markdown">Markdown</option></select></label>
                    <label class="field"><span>通知消息模板</span><CodeMirrorField :model-value="ch.config.messageTemplate" language="text" :height="120" aria-label="通知消息模板" placeholder="事件：{{event}}&#10;状态：{{status}}&#10;说明：{{message}}" @update:model-value="ch.config.messageTemplate = $event" /><small class="field-hint">支持变量：<code v-pre>{{event}}</code>、<code v-pre>{{status}}</code>、<code v-pre>{{message}}</code>、<code v-pre>{{timestamp}}</code>、<code v-pre>{{ok}}</code>。</small></label>
                    <label class="field"><span>测试消息内容</span><CodeMirrorField :model-value="ch.config.testMessageTemplate" language="text" :height="82" aria-label="测试消息内容" placeholder="PacPilot 测试通知" @update:model-value="ch.config.testMessageTemplate = $event" /></label>
                  </template>
                  <template v-else>
                    <div class="field-grid">
                      <label class="field"><span>HTTP 方法</span><select v-model="ch.config.method"><option value="POST">POST</option><option value="PUT">PUT</option><option value="PATCH">PATCH</option></select></label>
                      <label class="field"><span>内容类型</span><div class="field-static"><AppIcon name="file-text" :size="15" /> application/json</div></label>
                    </div>
                    <label class="field"><span>自定义请求头 <em>JSON</em></span><WebhookBodyEditor :model-value="ch.config.headers" :height="126" placeholder='{"Authorization":"Bearer …"}' @update:model-value="ch.config.headers = $event" /><small class="field-hint">敏感请求头在重新编辑时会显示脱敏占位符。</small></label>
                    <label class="field"><span>请求体模板 <em>JSON</em></span><WebhookBodyEditor :model-value="ch.config.body" :height="190" :sample="JSON.stringify({ event: '{{event}}', status: '{{status}}', ok: '{{ok}}', message: '{{message}}', timestamp: '{{timestamp}}' }, null, 2)" placeholder='{"event":"{{event}}","status":"{{status}}","message":"{{message}}"}' @update:model-value="ch.config.body = $event" /><small class="field-hint">请求体需要是有效 JSON，可使用事件变量自动填充通知内容。</small></label>
                    <label class="field"><span>测试请求体 <em>JSON</em></span><WebhookBodyEditor :model-value="ch.config.testBody" :height="144" :sample='JSON.stringify({ event: "{{event}}", status: "{{status}}", ok: "{{ok}}", message: "{{message}}", timestamp: "{{timestamp}}" }, null, 2)' placeholder='{"event":"PacPilot test","status":"test"}' @update:model-value="ch.config.testBody = $event" /></label>
                  </template>
                </section>
                <section class="form-section compact-section">
                  <div class="section-title"><span>03</span><div><h4>渠道状态</h4><p>停用后规则仍保留，但不会向此渠道投递。</p></div></div>
                  <label class="toggle-row"><span class="toggle-copy"><strong>启用此渠道</strong><small>启用后，匹配的通知规则可以向该目标发送消息。</small></span><input v-model="ch.enabled" type="checkbox" class="toggle-input" /><span class="toggle-track"></span></label>
                </section>
              </div></AppScrollArea>
              <footer class="editor-footer">
                <button type="button" class="button secondary" @click="resetC">新建空白表单</button>
                <button v-if="cid" type="button" class="button danger-ghost" @click="deleteC(channels.find(x => x.id === cid)!)"><AppIcon name="trash-2" :size="15" /> 删除</button>
                <span class="footer-spacer"></span>
                <button type="button" class="button secondary" :disabled="!cid || testingId === cid" @click="testC(channels.find(x => x.id === cid)!)"><AppIcon :name="testingId === cid ? 'loader-circle' : 'activity'" :size="15" :class="{ spin: testingId === cid }" /> {{ testingId === cid ? "正在测试…" : "测试发送" }}</button>
                <button type="submit" class="button primary" :disabled="busy || !ch.name.trim() || !ch.config.url.trim()"><AppIcon name="save" :size="15" /> {{ busy ? "正在保存…" : "保存渠道" }}</button>
              </footer>
              <div v-if="cid && !channelReady" class="editor-note"><AppIcon name="info" :size="15" /> 请补齐 URL；钉钉渠道还需要有效的机器人配置后才能测试发送。</div>
            </form>
            <section v-else class="editor-panel editor-placeholder" aria-live="polite"><div class="placeholder-icon"><AppIcon name="file-text" :size="22" /></div><p>暂无可查看信息,请选中一条再试吧</p></section>
          </section>

          <section v-else-if="tab === 'rules'" class="workspace-layout rule-layout">
            <AppScrollArea root-class="directory-panel" type="always">
              <div class="panel-heading"><div><h3>触发规则</h3><p>决定何时向哪些渠道发送</p></div><button class="icon-button" title="新建规则" aria-label="新建规则" @click="resetR">＋</button></div>
              <div v-if="!rules.length" class="empty-directory"><span class="empty-icon"><AppIcon name="route" :size="22" /></span><strong>还没有通知规则</strong><p>创建规则，把业务事件路由到通知渠道。</p><button class="button primary full" @click="resetR">创建第一条规则</button></div>
              <button v-for="item in rules" :key="item.id" class="directory-item rule-directory-item" :class="{ selected: rid === item.id }" @click="editR(item)">
                <span class="provider-icon rule-provider"><AppIcon name="route" :size="18" /></span>
                <span class="directory-content"><strong>{{ item.name }}</strong><small>{{ evName(item.eventType) }} · {{ phaseName(item.phase) }}</small><small>{{ outcomeName(item.outcome) }} · {{ item.channelIds.length }} 个通知渠道</small></span>
                <span class="status-dot" :class="{ online: item.enabled }" :title="item.enabled ? '已启用' : '已停用'"></span>
              </button>
              <div v-if="rules.length" class="directory-bottom"><span class="status-dot online"></span> {{ enabledRules.length }} 条规则正在生效</div>
            </AppScrollArea>

            <form v-if="ruleEditorOpen" class="editor-panel" @submit.prevent="saveR">
              <header class="editor-heading">
                <div class="editor-title-mark rule-title-mark"><AppIcon name="route" :size="19" /></div>
                <div class="editor-heading-copy"><div class="editor-kicker">{{ rid ? "RULE SETTINGS" : "NEW RULE" }}</div><h3>{{ rid ? "编辑触发规则" : "创建触发规则" }}</h3><p>用简单条件定义事件触发时机与通知目标。</p></div>
                <span class="status-pill" :class="rule.enabled ? 'pill-enabled' : 'pill-disabled'"><span class="status-dot" :class="{ online: rule.enabled }"></span>{{ rule.enabled ? "已启用" : "已停用" }}</span>
              </header>
              <AppScrollArea root-class="editor-scroll" type="always"><div class="editor-body">
                <section class="form-section">
                  <div class="section-title"><span>01</span><div><h4>规则信息</h4><p>给规则一个容易识别的名称。</p></div></div>
                  <label class="field"><span>规则名称 <i>*</i></span><input v-model="rule.name" required maxlength="80" placeholder="例如：任务失败时通知运维群" /></label>
                </section>
                <section class="form-section">
                  <div class="section-title"><span>02</span><div><h4>触发条件</h4><p>只有同时满足以下条件时，规则才会触发。</p></div></div>
                  <label class="field"><span>业务事件</span><select :value="rule.eventType" @change="setEvent(($event.target as HTMLSelectElement).value)"><option v-for="item in catalog" :key="item.type" :value="item.type">{{ item.label }}</option></select></label>
                  <div class="field-grid">
                    <label class="field"><span>触发阶段</span><select v-model="rule.phase"><option v-for="item in phases" :key="item" :value="item">{{ phaseName(item) }}</option></select></label>
                    <label class="field"><span>执行结果</span><select v-model="rule.outcome"><option value="any">不限制结果</option><option v-for="item in outcomes" :key="item" :value="item">{{ outcomeName(item) }}</option></select></label>
                  </div>
                  <div class="condition-hint"><AppIcon name="info" :size="16" /><div><strong>{{ phaseName(rule.phase) }} · {{ outcomeName(rule.outcome) }}</strong><p>{{ phaseDescription }}</p></div></div>
                  <label class="field"><span>业务对象类型 <em>可选条件</em></span><input v-model="rule.subjectType" placeholder="例如 task；留空表示匹配所有对象类型" /><small class="field-hint">例如 task、configuration 或 request。留空时不按对象类型过滤。</small></label>
                </section>
                <section class="form-section">
                  <div class="section-title"><span>03</span><div><h4>通知目标</h4><p>可同时选择多个已启用的渠道。</p></div></div>
                  <div v-if="!channels.length" class="inline-empty"><AppIcon name="network" :size="18" /><div><strong>还没有可用渠道</strong><p>先创建通知渠道，再回来配置规则。</p></div><button type="button" class="button secondary" @click="tab = 'channels'">前往渠道设置</button></div>
                  <div v-else class="channel-options">
                    <label v-for="item in channels" :key="item.id" class="channel-option" :class="{ checked: rule.channelIds.includes(item.id), unavailable: !item.enabled }">
                      <input v-model="rule.channelIds" type="checkbox" :value="item.id" :disabled="!item.enabled && !rule.channelIds.includes(item.id)" />
                      <span class="option-icon"><AppIcon :name="item.provider === 'dingtalk' ? 'bell-ring' : 'globe'" :size="17" /></span>
                      <span class="option-copy"><strong>{{ item.name }}</strong><small>{{ providerName(item.provider) }} · {{ item.enabled ? "已启用" : "已停用" }}</small></span>
                      <AppIcon v-if="rule.channelIds.includes(item.id)" name="circle-check" :size="17" class="option-check" />
                    </label>
                  </div>
                  <small v-if="rule.channelIds.length" class="field-hint">将发送到 {{ rule.channelIds.length }} 个渠道：{{ rule.channelIds.map(channelName).join("、") }}。</small>
                </section>
                <section class="form-section compact-section">
                  <div class="section-title"><span>04</span><div><h4>规则状态</h4><p>停用后保留配置，但不再匹配新事件。</p></div></div>
                  <label class="toggle-row"><span class="toggle-copy"><strong>启用此规则</strong><small>启用后，符合条件的新事件将创建通知投递。</small></span><input v-model="rule.enabled" type="checkbox" class="toggle-input" /><span class="toggle-track"></span></label>
                </section>
              </div></AppScrollArea>
              <footer class="editor-footer">
                <button type="button" class="button secondary" @click="resetR">新建空白表单</button>
                <button v-if="rid" type="button" class="button danger-ghost" @click="deleteR(rules.find(x => x.id === rid)!)"><AppIcon name="trash-2" :size="15" /> 删除</button>
                <span class="footer-spacer"></span>
                <button type="submit" class="button primary" :disabled="busy || !rule.name.trim() || !rule.channelIds.length"><AppIcon name="save" :size="15" /> {{ busy ? "正在保存…" : "保存规则" }}</button>
              </footer>
            </form>
            <section v-else class="editor-panel editor-placeholder" aria-live="polite"><div class="placeholder-icon"><AppIcon name="file-text" :size="22" /></div><p>暂无可查看信息,请选中一条再试吧</p></section>
          </section>

          <section v-else class="history-workspace">
            <div class="history-column">
              <AppScrollArea root-class="history-panel" type="always">
                <header class="panel-heading"><div><h3>最近事件</h3><p>业务系统发布的标准化事件</p></div><span class="neutral-count">{{ events.length }} 条</span></header>
                <div v-if="!events.length" class="empty-history"><span class="empty-icon"><AppIcon name="activity" :size="22" /></span><strong>暂时没有事件记录</strong><p>当任务或请求产生事件后，记录会显示在这里。</p></div>
                <article v-for="item in events" :key="item.id" class="event-row">
                  <span class="timeline-marker"><AppIcon :name="item.outcome === 'failure' ? 'circle-alert' : item.outcome === 'success' ? 'circle-check' : 'activity'" :size="16" /></span>
                  <div class="history-row-content"><div class="history-row-title"><strong>{{ evName(item.type) }}</strong><span class="phase-tag">{{ phaseName(item.phase) }}</span><span v-if="item.outcome" class="outcome-tag" :class="'outcome-' + item.outcome">{{ outcomeName(item.outcome) }}</span></div><p>{{ item.summary || "该事件没有附加说明。" }}</p><small>{{ formatDate(item.occurredAt) }} · {{ item.subject?.name || item.subject?.type || "业务事件" }}</small></div>
                </article>
              </AppScrollArea>
            </div>
            <div class="history-column delivery-column">
              <AppScrollArea root-class="history-panel" type="always">
                <header class="panel-heading delivery-heading"><div><h3>投递记录</h3><p>逐条查看渠道发送结果与重试状态</p></div><select v-model="deliveryFilter" class="filter-select" aria-label="按投递状态筛选"><option value="all">全部状态</option><option value="succeeded">已送达</option><option value="pending">等待发送</option><option value="sending">发送中</option><option value="failed">发送失败</option></select></header>
                <div v-if="!filteredDeliveries.length" class="empty-history"><span class="empty-icon"><AppIcon name="activity" :size="22" /></span><strong>{{ deliveries.length ? "没有符合条件的记录" : "还没有投递记录" }}</strong><p>{{ deliveries.length ? "试试切换其他投递状态。" : "当事件匹配到启用的规则时，会在这里创建投递记录。" }}</p></div>
                <article v-for="item in filteredDeliveries" :key="item.id" class="delivery-row">
                  <span class="delivery-status-icon" :class="'delivery-' + item.status"><AppIcon :name="statusIcon(item.status)" :size="16" /></span>
                  <div class="history-row-content"><div class="history-row-title"><strong>{{ channelName(item.channelId) }}</strong><span class="status-pill small-pill" :class="'delivery-pill-' + item.status">{{ statusName(item.status) }}</span></div><p>{{ events.find(event => event.id === item.eventId)?.summary || evName(events.find(event => event.id === item.eventId)?.type || "通知事件") }}</p><small>{{ formatDate(item.updatedAt) }} · 已尝试 {{ item.attemptCount }} 次</small><p v-if="item.lastError" class="delivery-error">{{ item.lastError }}</p></div>
                  <button v-if="item.status === 'failed'" class="button retry-button" @click="retry(item.id)"><AppIcon name="refresh-cw" :size="14" /> 重试</button>
                </article>
              </AppScrollArea>
            </div>
          </section>
        </section>
      </template>
      <AppFooter />
    </main>
  </AdminLayout>
</template>

<style scoped>
/* ============================================================
   Notification workspace — "quiet console" restyle.

   Layout contract (single owner per scroll region):
   - Desktop: the admin layout owns the viewport. This page is a
     flex column; intro/overview/tabs/footer are fixed bands and the
     workspace region takes exactly the remaining height. Panels are
     bounded by max-height:100% and scroll only inside AppScrollArea.
   - <=900px: the page returns to natural document flow and each panel
     gets its own bounded height (clamp against the viewport), so no
     region exceeds the size limits on small screens.
   Scrollbars come exclusively from the shared AppScrollArea component
   and are tuned through its public CSS variables (--scrollbar-size /
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

  /* Sticky workspace geometry (desktop). The header gap mirrors the 25px
     offset the admin layout uses between the topbar and page content, so
     the pinned tabs sit exactly where they would in normal flow. The
     footer reserve covers the footer band plus the page bottom padding. */
  --wh-header-gap: 25px;
  --wh-footer-reserve: 110px;

  display: flex;
  flex: 1 1 0%;
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
  /* Pins the footer to the page end whenever the workspace reserves less
     than the full viewport; during normal scrolling it collapses to the
     natural 0 gap because the page content already exceeds the viewport. */
  margin-top: auto;
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
  flex: 0 0 auto;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  min-width: 0;
  height: max(
    320px,
    calc(
      100dvh - var(--admin-topbar-space, 104px) - var(--wh-header-gap, 25px) -
        var(--wh-footer-reserve, 110px)
    )
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

/* ---------- Panels (shared surface + radius baseline) ---------- */

.directory-panel,
.editor-panel,
.history-panel {
  min-width: 0;
  min-height: 0;
  max-height: 100%;
  border: 1px solid var(--line);
  border-radius: var(--wh-radius-panel);
  background: var(--wh-panel-bg);
  box-shadow: var(--shadow);
  overflow: hidden;
}

/* ---------- Directory panel (channels / rules list) ---------- */

.directory-panel {
  display: flex;
  flex: 0 0 min(32%, 340px);
  flex-direction: column;
  width: min(32%, 340px);
  height: 100%;
  max-height: 100%;
  border-color: color-mix(in srgb, var(--accent) 12%, var(--line));
}

.directory-panel :deep(.app-scroll-area-viewport) {
  display: flex;
  flex: 1 1 0%;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-gutter: stable;
  overscroll-behavior: contain;
  background: transparent;
}

.panel-heading {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 19px;
}

.directory-panel .panel-heading {
  position: sticky;
  z-index: 1;
  top: 0;
  padding: 18px 17px 15px;
  border-bottom: 1px solid color-mix(in srgb, var(--accent) 14%, var(--line));
  background: var(--wh-heading-bg);
}

.panel-heading h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 780;
}

.panel-heading p {
  margin: 5px 0 0;
  color: var(--muted);
  font-size: 10px;
  line-height: 1.5;
}

.icon-button {
  display: grid;
  flex: 0 0 34px;
  place-items: center;
  width: 34px;
  height: 34px;
  border: 1px solid var(--line);
  border-radius: var(--wh-radius-control);
  background: var(--wh-panel-bg);
  color: var(--text);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  transition: border-color 150ms ease, background 150ms ease, color 150ms ease;
}

.icon-button:hover {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent);
}

.directory-item {
  position: relative;
  display: flex;
  flex: 0 0 auto;
  align-items: flex-start;
  gap: 11px;
  width: calc(100% - 16px);
  margin: 4px 8px;
  padding: 12px;
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

.provider-icon {
  display: grid;
  flex: 0 0 36px;
  place-items: center;
  width: 36px;
  height: 36px;
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

.directory-bottom {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 8px;
  margin: auto 0 0;
  padding: 13px 17px;
  border-top: 1px solid color-mix(in srgb, var(--accent) 14%, var(--line));
  background: var(--wh-heading-bg);
  color: var(--muted);
  font-size: 10px;
}

.empty-directory,
.empty-history {
  display: flex;
  flex: 0 0 auto;
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
  overscroll-behavior: contain;
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

.field input:not([type="checkbox"]),
.field select {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  min-height: 41px;
  padding: 0 11px;
  border: 1px solid var(--line);
  border-radius: var(--wh-radius-control);
  outline: none;
  background: var(--bg);
  color: var(--text);
  font: inherit;
  font-size: 11px;
  font-weight: 500;
}

.field input::placeholder { color: var(--muted); opacity: 0.8; }

.field input:focus,
.field select:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

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

.reveal-button {
  display: grid;
  flex: 0 0 41px;
  place-items: center;
  width: 41px;
  border: 1px solid var(--line);
  border-radius: var(--wh-radius-control);
  background: var(--wh-heading-bg);
  color: var(--muted);
  cursor: pointer;
}

.reveal-button:hover { border-color: var(--accent); color: var(--accent); }

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

.toggle-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 13px;
  min-height: 62px;
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: var(--wh-radius-item);
  background: var(--wh-heading-bg);
  cursor: pointer;
}

.toggle-copy { display: grid; flex: 1 1 auto; gap: 4px; }
.toggle-copy strong { font-size: 11px; }
.toggle-copy small { color: var(--muted); font-size: 10px; line-height: 1.5; }

.toggle-input {
  position: absolute;
  z-index: 1;
  top: 50%;
  right: 14px;
  width: 38px;
  height: 22px;
  margin: 0;
  opacity: 0;
  transform: translateY(-50%);
  cursor: pointer;
}

.toggle-track {
  position: relative;
  flex: 0 0 38px;
  width: 38px;
  height: 22px;
  border-radius: 99px;
  background: var(--line);
  transition: background 160ms ease;
}

.toggle-track::after {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--wh-panel-bg);
  box-shadow: 0 1px 3px #0002;
  content: "";
  transition: transform 160ms ease;
}

.toggle-input:checked + .toggle-track { background: var(--accent); }
.toggle-input:checked + .toggle-track::after { transform: translateX(16px); }
.toggle-input:focus-visible + .toggle-track { outline: 3px solid var(--accent-soft); outline-offset: 2px; }

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

.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 37px;
  padding: 0 13px;
  border: 1px solid transparent;
  border-radius: 8px;
  font: inherit;
  font-size: 11px;
  font-weight: 680;
  white-space: nowrap;
  cursor: pointer;
  transition: background 150ms ease, border-color 150ms ease, color 150ms ease;
}

.button:disabled { opacity: 0.5; cursor: not-allowed; }
.button.primary { border-color: var(--accent); background: var(--accent); color: var(--accent-contrast); }
.button.primary:hover:not(:disabled) { filter: brightness(0.96); }
.button.secondary { border-color: var(--line); background: var(--wh-panel-bg); color: var(--text); }
.button.secondary:hover:not(:disabled) { border-color: var(--accent); background: var(--wh-item-hover); color: var(--accent); }
.button.danger-ghost { border-color: color-mix(in srgb, var(--red) 22%, var(--line)); background: transparent; color: var(--red); }
.button.danger-ghost:hover { background: var(--red-soft); }
.button.full { width: 100%; }

.button:focus-visible,
.icon-button:focus-visible,
.workspace-tabs button:focus-visible,
.directory-item:focus-visible,
.reveal-button:focus-visible {
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
.channel-option input { width: 15px; height: 15px; accent-color: var(--accent); }

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

/* ---------- History ---------- */

.history-workspace {
  display: grid;
  grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.05fr);
}

.history-column {
  display: flex;
  min-width: 0;
  min-height: 0;
  max-height: 100%;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: var(--wh-radius-panel);
  background: var(--wh-panel-bg);
  box-shadow: var(--shadow);
}

.history-panel {
  display: flex;
  flex: 1 1 0%;
  flex-direction: column;
  width: 100%;
  height: 100%;
  border: 0;
  border-radius: inherit;
  box-shadow: none;
}

.history-panel :deep(.app-scroll-area-viewport) {
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-gutter: stable;
  overscroll-behavior: contain;
}

.history-panel .panel-heading {
  position: sticky;
  z-index: 2;
  top: 0;
  border-bottom: 1px solid var(--line);
  background: var(--wh-heading-bg);
}

.delivery-heading { gap: 14px; }

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

.filter-select {
  max-width: 145px;
  min-height: 34px;
  padding: 0 9px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--bg);
  color: var(--text);
  font: inherit;
  font-size: 10px;
}

.filter-select:focus {
  outline: 2px solid color-mix(in srgb, var(--accent) 28%, transparent);
  outline-offset: 1px;
}

.delivery-error { padding: 8px 9px; border-radius: 7px; background: var(--red-soft); color: var(--red) !important; }
.retry-button { align-self: center; min-height: 32px; padding: 0 9px; }

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
  .history-column,
  .history-panel {
    max-height: none;
    width: 100%;
    min-width: 0;
  }

  .directory-panel {
    flex: 0 0 auto;
    height: var(--wh-directory-height);
  }

  .directory-panel :deep(.app-scroll-area-viewport) {
    height: 100%;
  }

  .editor-panel {
    height: var(--wh-editor-height);
  }

  .history-workspace { display: flex; }

  .history-column {
    height: var(--wh-history-height);
  }

  .history-panel :deep(.app-scroll-area-viewport) {
    height: 100%;
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
  .editor-footer .button { flex: 1 1 auto; }
  .editor-footer .button.primary { flex: 1 0 100%; }
  .editor-note { padding-right: 16px; padding-left: 16px; }
  .inline-empty { flex-wrap: wrap; }
  .delivery-heading { align-items: flex-start; flex-direction: column; }
  .filter-select { max-width: none; width: 100%; }
  .event-row,
  .delivery-row { gap: 9px; padding: 13px; }
  .retry-button { padding: 0 7px; font-size: 10px; }
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
