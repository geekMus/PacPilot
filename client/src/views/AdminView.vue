<script setup lang="ts">
import { onMounted, reactive, ref, computed, nextTick, watch } from "vue";
import { useRouter, useRoute } from "vue-router";
import {
  api,
  type AppSettings,
  type GenerationLog,
  type GenpacProbe,
  type WebhookConfig,
} from "../api/client";
import AdminLayout from "../components/AdminLayout.vue";
import AppFooter from "../components/AppFooter.vue";
import DomainListEditor from "../components/DomainListEditor.vue";
import WebhookChannelEditor from "../components/WebhookChannelEditor.vue";
import TextDetail from "../components/TextDetail.vue";
import cronstrue from "cronstrue";
import { CronExpressionParser } from "cron-parser";
import "cronstrue/locales/zh_CN";

const router = useRouter();
const route = useRoute();
const loading = ref(true);
const saving = ref(false);
const flash = ref("");
const flashOk = ref(true);
const error = ref("");
const logs = ref<GenerationLog[]>([]);
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
  webhookSuccessUrl: "",
  webhookSuccessBody: "",
  webhookFailureUrl: "",
  webhookFailureBody: "",
  webhookSuccessConfig: defaultWebhookConfig(),
  webhookFailureConfig: defaultWebhookConfig(),
});

function defaultWebhookConfig(): WebhookConfig {
  return {
    provider: "custom", url: "", method: "POST", headers: "{}", body: "",
    dingTalkSecret: "", dingTalkMessageType: "text",
    testBody: JSON.stringify({ ok: "{{ok}}", event: "{{event}}", message: "{{message}}", timestamp: "{{timestamp}}" }, null, 2),
    messageTemplate: "genpac-runner 通知\n事件：{{event}}\n状态：{{status}}\n时间：{{timestamp}}\n详情：{{message}}",
    testMessageTemplate: "genpac-runner 测试通知\n时间：{{timestamp}}\n结果：{{message}}",
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
    messageTemplate: value?.messageTemplate?.trim() ? value.messageTemplate : defaultWebhookConfig().messageTemplate,
    testMessageTemplate: value?.testMessageTemplate?.trim() ? value.testMessageTemplate : defaultWebhookConfig().testMessageTemplate,
  };
}

const commonTimeZones = [
  { value: "Asia/Shanghai", label: "中国标准时间（UTC+08:00）" },
  { value: "Asia/Taipei", label: "中国台湾 · 台北" },
  { value: "Asia/Hong_Kong", label: "中国香港" },
  { value: "Asia/Tokyo", label: "日本 · 东京" },
  { value: "Asia/Seoul", label: "韩国 · 首尔" },
  { value: "Asia/Singapore", label: "新加坡" },
  { value: "Asia/Bangkok", label: "泰国 · 曼谷" },
  { value: "Asia/Kolkata", label: "印度 · 加尔各答" },
  { value: "Asia/Dubai", label: "阿联酋 · 迪拜" },
  { value: "Europe/London", label: "英国 · 伦敦" },
  { value: "Europe/Paris", label: "法国 · 巴黎" },
  { value: "Europe/Berlin", label: "德国 · 柏林" },
  { value: "America/New_York", label: "美国东部 · 纽约" },
  { value: "America/Chicago", label: "美国中部 · 芝加哥" },
  { value: "America/Denver", label: "美国山地 · 丹佛" },
  { value: "America/Los_Angeles", label: "美国西部 · 洛杉矶" },
  { value: "America/Toronto", label: "加拿大 · 多伦多" },
  { value: "Australia/Sydney", label: "澳大利亚 · 悉尼" },
  { value: "Pacific/Auckland", label: "新西兰 · 奥克兰" },
  { value: "Etc/UTC", label: "协调世界时 · UTC" },
] as const;

function isValidTimeZone(value: string): boolean {
  try { new Intl.DateTimeFormat("en-US", { timeZone: value.trim() }).format(new Date()); return true; }
  catch { return false; }
}

const filteredTimeZones = computed(() => {
  const query = timezoneQuery.value.trim().toLowerCase();
  if (!query) return commonTimeZones;
  return commonTimeZones.filter((zone) => zone.value.toLowerCase().includes(query) || zone.label.toLowerCase().includes(query));
});
function selectTimeZone(value: string) {
  form.timezone = value;
  timezoneQuery.value = value;
  timezoneMenuOpen.value = false;
  mobileTimezoneOpen.value = false;
}
function closeTimezoneMenu() {
  window.setTimeout(() => { timezoneMenuOpen.value = false; }, 140);
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

watch(() => route.hash, (hash) => {
  if (hash) void scrollToCurrentSection();
});

const modeHint = computed(() =>
  form.mode === "custom"
    ? "使用直连 / 黑名单列表，默认走代理；内网始终直连。"
    : "从远程规则列表生成 PAC；匹配到代理域名时走代理，例外及未命中域名直连。自定义规则优先。"
);


const cronPresets = [
  { label: "关闭", value: "", hint: "不定时更新" },
  { label: "每小时", value: "0 * * * *", hint: "每小时整点" },
  { label: "每 3 小时", value: "0 */3 * * *", hint: "每 3 小时" },
  { label: "每天 0 点", value: "0 0 * * *", hint: "每天 00:00" },
  { label: "每天 6 点", value: "0 6 * * *", hint: "每天 06:00" },
  { label: "每周一 0 点", value: "0 0 * * 1", hint: "每周一 00:00" },
] as const;

function parseCronDescription(expr: string): { description: string; error: string } {
  const value = expr.trim();
  if (!value) return { description: "", error: "" };
  if (value.split(/\s+/).length !== 5) {
    return { description: "", error: "请使用标准的 5 段格式：分 时 日 月 周。" };
  }
  try {
    CronExpressionParser.parse(value);
    return {
      description: cronstrue.toString(value, {
        locale: "zh_CN",
        dayOfWeekStartIndexZero: false,
        use24HourTimeFormat: true,
        throwExceptionOnParseError: true,
      }),
      error: "",
    };
  } catch {
    return { description: "", error: "无法解析该表达式，请检查字段范围和语法。" };
  }
}

const cronParse = computed(() => parseCronDescription(form.cronSchedule));
const cronHint = computed(() => {
  if (!form.cronSchedule.trim()) return "已关闭定时任务；保存后不会按计划自动生成 PAC。";
  if (cronParse.value.error) return `表达式无效：${cronParse.value.error}`;
  return `计划说明：${cronParse.value.description}。按所选时区 ${form.timezone} 执行。`;
});

function applyCronPreset(value: string) {
  form.cronSchedule = value;
}

function jsonBodyError(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  try {
    const value: unknown = JSON.parse(s);
    if (value === null || typeof value !== "object") return "JSON 顶层必须是对象或数组。";
    return "";
  } catch {
    return "JSON 格式错误，请检查括号、引号和逗号。";
  }
}

function validateWebhookDraft(config: WebhookConfig, label: string): string[] {
  const errors: string[] = [];
  if (config.provider === "custom") {
    const active = Boolean(config.url.trim() || config.body.trim() || config.headers.trim() !== "{}");
    if (!active) return errors;
    if (!config.url.trim() || !looksLikeUrl(config.url.trim())) errors.push(`${label}需要有效的 HTTP(S) URL。`);
    if (config.body.trim() && jsonBodyError(config.body)) errors.push(`${label}请求 Body 必须是合法 JSON 对象或数组。`);
    if (config.testBody.trim() && jsonBodyError(config.testBody)) errors.push(`${label}测试请求 Body 必须是合法 JSON 对象或数组。`);
    if (config.headers.trim()) {
      try {
        const headers: unknown = JSON.parse(config.headers);
        if (!headers || typeof headers !== "object" || Array.isArray(headers) ||
            Object.values(headers as Record<string, unknown>).some((value) => typeof value !== "string")) {
          errors.push(`${label}请求头必须是名称和值均为字符串的 JSON 对象。`);
        }
      } catch {
        errors.push(`${label}请求头不是合法 JSON。`);
      }
    }
  } else if (config.provider === "dingtalk") {
    if (config.url.trim()) {
      if (!looksLikeUrl(config.url.trim())) errors.push(label + "钉钉 URL 必须是有效的 HTTP(S) 地址。");
      else if (!new URL(config.url.trim()).searchParams.has("access_token")) errors.push(label + "钉钉 URL 缺少 access_token。");
      if (!config.dingTalkSecret.trim()) errors.push(label + "钉钉机器人必须填写 Secret 加签密钥。");
    } else if (config.dingTalkSecret.trim()) {
      errors.push(label + "填写 Secret 前，请先填写机器人 Webhook URL。");
    }
  }
  return errors;
}

function looksLikeUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return (u.protocol === "http:" || u.protocol === "https:") &&
      Boolean(u.hostname) && !u.username && !u.password;
  } catch {
    return false;
  }
}

/** 保存前校验；返回可读错误列表（空表示可提交） */
const formErrors = computed(() => {
  const errs: string[] = [];
  if (!form.pacProxy.trim()) {
    errs.push("请填写 PAC 代理字符串。");
  }
  if (form.mode === "remote") {
    if (!form.listUrl.trim()) {
      errs.push("远程列表模式需要填写规则列表 URL。");
    } else if (!looksLikeUrl(form.listUrl.trim())) {
      errs.push("规则列表 URL 格式无效，请使用 http(s):// 开头的地址。");
    }
  }
  const cron = form.cronSchedule.trim();
  if (cron && cronParse.value.error) {
    errs.push("Cron 表达式无效，请检查五段格式与字段取值。");
  }
  if (!isValidTimeZone(form.timezone)) errs.push("时区无效，请从建议列表选择，或输入有效的 IANA 时区名称。");
  errs.push(...validateWebhookDraft(form.webhookSuccessConfig, "成功通知"));
  errs.push(...validateWebhookDraft(form.webhookFailureConfig, "失败通知"));
  return errs;
});

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
  form.webhookSuccessUrl = s.webhookSuccessUrl;
  form.webhookSuccessBody = s.webhookSuccessBody;
  form.webhookFailureUrl = s.webhookFailureUrl;
  form.webhookFailureBody = s.webhookFailureBody;
  form.webhookSuccessConfig = normalizedWebhookConfig(s.webhookSuccessConfig, s.webhookSuccessUrl, s.webhookSuccessBody);
  form.webhookFailureConfig = normalizedWebhookConfig(s.webhookFailureConfig, s.webhookFailureUrl, s.webhookFailureBody);
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
    webhookSuccessUrl: form.webhookSuccessConfig.url,
    webhookSuccessBody: form.webhookSuccessConfig.body,
    webhookFailureUrl: form.webhookFailureConfig.url,
    webhookFailureBody: form.webhookFailureConfig.body,
    webhookSuccessConfig: { ...form.webhookSuccessConfig },
    webhookFailureConfig: { ...form.webhookFailureConfig },
  };
}

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
      api.logs(),
      api.genpacStatus().catch(
        (): GenpacProbe => ({
          available: false,
          command: null,
          detail: "无法检测引擎状态",
        })
      ),
    ]);
    applySettings(settings);
    logs.value = logList;
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

function showFlash(msg: string, ok = true) {
  flash.value = msg;
  flashOk.value = ok;
}

async function saveAndGenerate() {
  flash.value = "";
  error.value = "";
  if (formErrors.value.length) {
    showFlash(formErrors.value.join("\n"), false);
    return;
  }
  saving.value = true;
  try {
    await api.saveSettings(toPayload());
    const result = await api.generate();
    showFlash(
      result.success
        ? "配置已保存，PAC 生成成功"
        : `配置已保存，但生成失败：\n${result.message}`,
      result.success
    );
    logs.value = await api.logs();
    genpacProbe.value = await api.genpacStatus().catch(() => genpacProbe.value);
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
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
    state.message = "请先填写通知目标 URL。";
    return;
  }
  const validationErrors = validateWebhookDraft(config, kind === "success" ? "成功通知" : "失败通知");
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
      ? `目标端点已接受测试请求（HTTP ${result.status ?? "未知"}）。`
      : result.status
        ? `测试失败：${result.message}（HTTP ${result.status}）`
        : `测试失败：${result.message}`;
  } catch (e) {
    state.ok = false;
    state.message = e instanceof Error ? e.message : String(e);
  } finally {
    state.pending = false;
  }
}

async function changeAdminPassword() {
  flash.value = "";
  error.value = "";
  if (!passwordForm.currentPassword) { error.value = "请输入当前管理密码。"; return; }
  if (passwordForm.newPassword !== passwordForm.confirmPassword) { error.value = "两次输入的新密码不一致。"; return; }
  passwordSaving.value = true;
  try {
    await api.changePassword({
      currentPassword: passwordForm.currentPassword,
      newPassword: passwordForm.newPassword,
    });
    await router.replace({ path: "/admin/login", query: { passwordChanged: "1" } });
  } catch (e) {
    error.value = e instanceof Error ? e.message : "修改密码失败，请重试。";
  } finally {
    passwordSaving.value = false;
  }
}

async function logout() {
  await api.logout();
  await router.push("/admin/login");
}
</script>

<template>
  <AdminLayout active="settings" title="配置管理" subtitle="管理 PAC 生成方式、代理规则、定时任务与通知渠道。">
    <template #actions>
      <button type="button" class="admin-logout-button" @click="logout">退出登录</button>
    </template>
    <div class="admin-page">

    <p v-if="loading" class="state-msg">加载中…</p>
    <div v-if="flash" class="banner" :class="flashOk ? 'ok' : 'bad'">
      <span class="banner-icon" aria-hidden="true">{{ flashOk ? "✓" : "!" }}</span>
      <pre class="banner-text">{{ flash }}</pre>
    </div>
    <div v-if="error" class="banner bad">
      <span class="banner-icon" aria-hidden="true">!</span>
      <pre class="banner-text">{{ error }}</pre>
    </div>

    <template v-if="!loading && !error">
      <section id="security" class="card security-card">
        <div class="card-head">
          <div>
            <h2>管理密码</h2>
            <p class="card-sub">密码保存在本地数据库，不再通过环境变量配置。</p>
          </div>
        </div>
        <div v-if="securityStatus.isDefaultPassword" class="password-warning" role="alert">
          <strong>安全提醒：当前仍使用默认密码 password</strong>
          <p>建议将默认密码改成只有你知道的密码，避免其他人通过默认密码进入管理后台。新密码不限制长度或复杂度，由你自行决定。</p>
        </div>
        <div v-if="securityStatus.mustChangePassword" class="password-warning" role="alert">
          <strong>需要设置新密码</strong>
          <p>当前使用的是容器命令生成的一次性临时密码。完成修改前，其他管理功能会保持锁定。</p>
        </div>
        <form class="password-change-form" @submit.prevent="changeAdminPassword">
          <div class="field">
            <label for="current-admin-password">当前管理密码</label>
            <input id="current-admin-password" v-model="passwordForm.currentPassword" type="password" autocomplete="current-password" required />
          </div>
          <div class="field">
            <label for="new-admin-password">新管理密码</label>
            <input id="new-admin-password" v-model="passwordForm.newPassword" type="password" autocomplete="new-password" required placeholder="输入新密码（不限制长度或复杂度）" />
          </div>
          <div class="field">
            <label for="confirm-admin-password">确认新密码</label>
            <input id="confirm-admin-password" v-model="passwordForm.confirmPassword" type="password" autocomplete="new-password" required />
          </div>
          <div class="actions">
            <button type="submit" class="btn primary" :disabled="passwordSaving">
              {{ passwordSaving ? "正在修改…" : "修改管理密码" }}
            </button>
          </div>
        </form>
        <p class="field-hint">忘记密码时，可在宿主机执行 <code>docker exec -it genpac-runner bun run /app/scripts/reset-admin-password.ts</code>，然后使用命令输出的一次性密码登录。</p>
      </section>

      <form v-if="!securityStatus.mustChangePassword" class="stack" @submit.prevent="saveAndGenerate">
        <!-- 常规设置 -->
        <section id="general" class="card">
          <div class="card-head">
            <div class="card-title">
              <span class="icon-badge" aria-hidden="true">◷</span>
              <div>
                <h2>常规设置</h2>
                <p class="card-sub">常规选项保存在数据库中，不需要编辑 Docker 环境变量。</p>
              </div>
            </div>
          </div>
          <div class="field">
            <label for="timezone">时区</label>
            <div class="timezone-picker desktop-timezone-picker">
              <input id="timezone" v-model="form.timezone" autocomplete="off" spellcheck="false"
                placeholder="搜索时区名称或代码，例如中国标准时间、Asia/Tokyo"
                @focus="timezoneMenuOpen = true; timezoneQuery = ''"
                @input="timezoneQuery = form.timezone"
                @blur="closeTimezoneMenu"
                @keydown.esc="timezoneMenuOpen = false" />
              <div v-if="timezoneMenuOpen" class="timezone-options-menu" role="listbox" aria-label="时区建议">
                <button v-for="zone in filteredTimeZones" :key="zone.value" type="button" role="option"
                  :aria-selected="form.timezone === zone.value" class="timezone-option"
                  @pointerdown.prevent="selectTimeZone(zone.value)">
                  <span>{{ zone.label }}</span><code>{{ zone.value }}</code>
                </button>
                <p v-if="filteredTimeZones.length === 0" class="timezone-no-results">没有匹配项；可以直接输入有效的 IANA 时区名称。</p>
              </div>
            </div>
            <button type="button" class="mobile-timezone-trigger" @click="openMobileTimezonePicker">
              <span>{{ form.timezone || "选择时区" }}</span>
              <span class="mobile-timezone-trigger-icon" aria-hidden="true">⌄</span>
            </button>
            <p class="field-hint">可按地区名称或 IANA 时区代码搜索，也可直接输入有效的时区代码。该设置统一用于定时任务、运行记录和 Webhook 通知的时间显示。</p>
          </div>

          <div v-if="mobileTimezoneOpen" class="timezone-sheet-backdrop" @click.self="mobileTimezoneOpen = false">
            <section class="timezone-sheet" role="dialog" aria-modal="true" aria-labelledby="mobile-timezone-title" @keydown.esc="mobileTimezoneOpen = false">
              <header class="timezone-sheet-head">
                <h3 id="mobile-timezone-title">选择时区</h3>
                <button type="button" class="timezone-sheet-close" aria-label="关闭时区选择" @click="mobileTimezoneOpen = false">×</button>
              </header>
              <input v-model="timezoneQuery" class="timezone-sheet-search" type="search" autocomplete="off"
                placeholder="搜索时区名称或代码，如 Asia/Tokyo" @keydown.enter.prevent />
              <div class="timezone-sheet-options" role="listbox" aria-label="时区建议">
                <button v-for="zone in filteredTimeZones" :key="zone.value" type="button" role="option"
                  :aria-selected="form.timezone === zone.value" class="timezone-option"
                  @click="selectTimeZone(zone.value)">
                  <span>{{ zone.label }}</span><code>{{ zone.value }}</code>
                </button>
                <button v-if="timezoneQuery.trim() && isValidTimeZone(timezoneQuery) && !commonTimeZones.some(zone => zone.value.toLowerCase() === timezoneQuery.trim().toLowerCase())"
                  type="button" role="option" class="timezone-option timezone-custom-option"
                  @click="selectTimeZone(timezoneQuery.trim())">
                  <span>使用自定义时区</span><code>{{ timezoneQuery.trim() }}</code>
                </button>
                <p v-if="filteredTimeZones.length === 0 && !isValidTimeZone(timezoneQuery)" class="timezone-no-results">没有匹配项。请输入有效的 IANA 时区名称。</p>
              </div>
              <p class="timezone-sheet-hint">选择后会填入配置，保存后生效。也可输入其他有效的 IANA 时区代码。</p>
            </section>
          </div>
          <div class="chip-row timezone-presets">
            <button v-for="zone in commonTimeZones.slice(0, 6)" :key="zone.value" type="button" class="chip"
              :class="{ active: form.timezone === zone.value }" @click="form.timezone = zone.value">{{ zone.label }}</button>
          </div>
        </section>

        <!-- 模式 -->
        <section id="mode" class="card">
          <div class="card-head">
            <div class="card-title">
              <span class="icon-badge" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v18M5 8h14M5 16h14"/></svg>
              </span>
              <div>
                <h2>启动模式</h2>
                <p class="card-sub">选择 PAC 如何生成</p>
              </div>
            </div>
          </div>

          <div class="mode-grid">
            <label class="mode-card" :class="{ active: form.mode === 'custom' }">
              <input v-model="form.mode" type="radio" value="custom" />
              <div class="mode-card-body">
                <div class="mode-top">
                  <span class="mode-name">自定义规则</span>
                  <span class="tag">推荐</span>
                </div>
                <p class="mode-desc">直连列表、黑名单与默认代理，适合本机快速配置。</p>
              </div>
            </label>
            <label class="mode-card" :class="{ active: form.mode === 'remote' }">
              <input v-model="form.mode" type="radio" value="remote" />
              <div class="mode-card-body">
                <div class="mode-top">
                  <span class="mode-name">远程规则列表</span>
                  <span class="tag">Bun 内置</span>
                </div>
                <p class="mode-desc">从远程规则列表生成；匹配到代理域名时走代理，例外及未命中域名直连。</p>
              </div>
            </label>
          </div>

          <p class="hint-line">{{ modeHint }}</p>

          <div
            v-if="form.mode === 'remote' && genpacProbe"
            class="probe"
            :class="genpacProbe.available ? 'ok' : 'warn'"
          >
            <strong>{{ genpacProbe.available ? "远程列表引擎就绪" : "引擎状态异常" }}</strong>
            <span>{{ genpacProbe.detail }}</span>
            <span v-if="!genpacProbe.available" class="probe-help">
              请检查列表 URL 是否可访问，或改用「自定义规则」模式。
            </span>
          </div>
        </section>

        <!-- 代理 -->
        <section id="proxy" class="card">
          <div class="card-head">
            <div class="card-title">
              <span class="icon-badge" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>
              </span>
              <div>
                <h2>代理与远程列表</h2>
                <p class="card-sub">设置默认代理字符串，并指定远程规则列表来源</p>
              </div>
            </div>
          </div>

          <div class="field">
            <label for="pacProxy">PAC 代理字符串</label>
            <input
              id="pacProxy"
              v-model="form.pacProxy"
              placeholder="SOCKS5 127.0.0.1:1080; DIRECT"
            />
            <p class="field-hint">每个代理项用分号分隔。支持 PROXY、HTTP、HTTPS、SOCKS、SOCKS4、SOCKS5 和 DIRECT；代理地址必须填写端口，例如 SOCKS5 127.0.0.1:1080; DIRECT。</p>
          </div>
          <div class="field">
            <label for="listUrl">规则列表 URL <span class="lab-hint">GFWList / 域名型 AutoProxy、ABP / 明文域名</span></label>
            <input id="listUrl" v-model="form.listUrl" :disabled="form.mode !== 'remote'" placeholder="https://example.com/list.txt" />
            <p class="field-hint">按提取出的域名进行匹配；URL 路径、资源类型等复杂过滤条件不会保留。</p>
          </div>
          <div class="checks">
            <label class="check">
              <input v-model="form.pacCompress" type="checkbox" :disabled="form.mode !== 'remote'" />
              <span>压缩远程 PAC</span>
            </label>
          </div>
          <p class="field-hint">压缩选项仅在远程规则列表模式下生效。</p>
        </section>

        <!-- 规则列表 -->
        <section id="rules" class="card">
          <div class="card-head">
            <div class="card-title">
              <span class="icon-badge" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>
              </span>
              <div>
                <h2>自定义规则</h2>
                <p class="card-sub">直连与黑名单在「自定义」和「远程列表」两种模式下都会生效</p>
              </div>
            </div>
          </div>

          <details class="help">
            <summary>如何配置？生效顺序说明</summary>
            <div class="help-body">
              <p><strong>写法：</strong>每行填写一条域名规则。支持完整域名 <code>example.com</code> 和通配符 <code>*.example.com</code>。自定义直连与黑名单列表不支持注释行，请只填写规则，不要添加说明文字。</p>
              <p><strong>直连列表：</strong>命中后返回 <code>DIRECT</code>（不走代理）。</p>
              <p><strong>黑名单：</strong>命中后返回 <code>PROXY 0.0.0.0:0</code>，让客户端连接不可用的代理地址以阻止访问；具体提示取决于客户端。</p>
              <p><strong>匹配优先级（两种模式相同）：</strong></p>
              <ol>
                <li>本机 / 内网地址 → 始终直连</li>
                <li>黑名单 → 拒绝</li>
                <li>直连列表 → 直连</li>
                <li>若为远程列表模式：再匹配远程规则（列表中的域名走代理，列表内例外直连）</li>
                <li>自定义模式剩余流量走「PAC 代理字符串」；远程列表模式剩余流量默认直连</li>
              </ol>
            </div>
          </details>

          <div class="split editors">
            <div class="field">
              <label>直连列表</label>
              <DomainListEditor
                v-model="form.directListText"
                :height="320"
                placeholder="baidu.com&#10;*.cn"
              />
            </div>
            <div class="field">
              <label>黑名单</label>
              <DomainListEditor
                v-model="form.blockListText"
                :height="320"
                placeholder="ads.example.com"
              />
            </div>
          </div>
        </section>

        <!-- 定时与 webhook -->
        <section id="schedule" class="card">
          <div class="card-head">
            <div class="card-title">
              <span class="icon-badge" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
              </span>
              <div>
                <h2>定时与 Webhook</h2>
                <p class="card-sub">均可选。定时任务按计划生成 PAC；Webhook 在生成成功或失败时发送通知，HTTP 方法按渠道配置（钉钉固定使用 POST）。</p>
              </div>
            </div>
          </div>

          <div class="sub-block">
            <div class="sub-title">定时生成</div>
            <div class="chip-row" role="group" aria-label="Cron 预设">
              <button
                v-for="p in cronPresets"
                :key="p.label"
                type="button"
                class="chip"
                :class="{ active: form.cronSchedule.trim() === p.value }"
                @click="applyCronPreset(p.value)"
              >
                {{ p.label }}
              </button>
            </div>
            <div class="field">
              <label for="cron">Cron 表达式 <span class="lab-hint">5 段 · 分 时 日 月 周</span></label>
              <input
                id="cron"
                v-model="form.cronSchedule"
                class="mono"
                spellcheck="false"
                autocomplete="off"
                placeholder="例如 0 */3 * * *"
              />
              <p class="field-hint">{{ cronHint }}</p>
            </div>
          </div>

                    <div class="webhook-grid">
            <WebhookChannelEditor
              title="成功时通知"
              kind="success"
              :model-value="form.webhookSuccessConfig"
              :pending="webhookTestState.success.pending"
              :result-message="webhookTestState.success.message"
              :result-ok="webhookTestState.success.ok"
              @update:model-value="form.webhookSuccessConfig = $event"
              @test="testWebhook('success')"
            />
            <WebhookChannelEditor
              title="失败时通知"
              kind="failure"
              :model-value="form.webhookFailureConfig"
              :pending="webhookTestState.failure.pending"
              :result-message="webhookTestState.failure.message"
              :result-ok="webhookTestState.failure.ok"
              @update:model-value="form.webhookFailureConfig = $event"
              @test="testWebhook('failure')"
            />
          </div>
        </section>

        <div class="actions-block">
          <div v-if="formErrors.length" class="validation-box">
            <div class="validation-title">请先修正以下问题后再保存</div>
            <ul>
              <li v-for="(e, i) in formErrors" :key="i">{{ e }}</li>
            </ul>
          </div>
          <div class="actions">
            <button
              type="submit"
              class="btn primary btn-save"
              :disabled="!canSubmit"
            >
              <svg v-if="saving" class="save-spinner" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-dasharray="42 16" /></svg>
              <svg v-else viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 4h12l3 3v13H4V4z"/><path d="M8 4v6h8V4M8 20v-6h8v6"/></svg>
              <span>{{ saving ? "保存并生成中…" : "保存并生成 PAC" }}</span>
            </button>
          </div>
          <p class="actions-hint">
            将写入配置并立即按当前模式重新生成 PAC。校验未通过时按钮不可用。
          </p>
        </div>
      </form>

      <section id="logs" class="card">
        <div class="card-head">
          <div class="card-title">
            <span class="icon-badge" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19V5M4 19h16M8 15V9M12 15V7M16 15v-3"/></svg>
            </span>
            <div>
              <h2>最近生成记录</h2>
              <p class="card-sub">最新 50 条</p>
            </div>
          </div>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>时间</th>
                <th>结果</th>
                <th>模式</th>
                <th>信息</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="l in logs" :key="l.id">
                <td class="nowrap">{{ l.created_at }}</td>
                <td>
                  <span class="pill" :class="l.success ? 'ok' : 'bad'">
                    {{ l.success ? "成功" : "失败" }}
                  </span>
                </td>
                <td>{{ l.mode }}</td>
                <td class="msg"><TextDetail :text="l.message || ''" label="生成记录信息" /></td>
              </tr>
              <tr v-if="!logs.length">
                <td colspan="4" class="empty">暂无记录</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
    <AppFooter />
    </div>
  </AdminLayout>
</template>

<style scoped>
.admin-page {
  min-width: 0;
  padding-bottom: var(--space-6);
}
.admin-logout-button {
  display:inline-flex;
  align-items:center;
  justify-content:center;
  min-height:34px;
  padding:0 11px;
  border:1px solid var(--line);
  border-radius:8px;
  background:var(--surface);
  color:var(--text);
  font:inherit;
  font-size:11px;
  font-weight:700;
  cursor:pointer;
}
.admin-logout-button:hover { border-color:var(--accent); color:var(--accent); }
#security,#general,#mode,#proxy,#rules,#schedule,#logs { scroll-margin-top: 110px; }
.state-msg {
  color: var(--muted);
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
  transition: border-color 0.15s, box-shadow 0.15s;
}
.mode-card input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}
.mode-card.active {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-soft);
  background: var(--surface);
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
  transition: border-color 0.15s, box-shadow 0.15s;
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
  transition: background 0.15s, border-color 0.15s;
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
  filter: brightness(1.05);
}
.admin-page .actions .btn-save {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  min-width: 190px;
  min-height: 46px;
  padding: 11px 20px;
  background: #405fe8;
  border: 1px solid #405fe8;
  color: #fff !important;
  -webkit-text-fill-color: #fff;
  font-weight: 750;
  letter-spacing: .01em;
  box-shadow: 0 5px 14px rgba(64, 95, 232, .22);
  transition: background .15s, box-shadow .15s, transform .15s;
}
.admin-page .actions .btn-save svg { flex: 0 0 auto; }
.admin-page .actions .btn-save:hover:not(:disabled) {
  background: #304fd4;
  border-color: #304fd4;
  box-shadow: 0 7px 18px rgba(64, 95, 232, .28);
  filter: none;
  transform: translateY(-1px);
}
.admin-page .actions .btn-save:focus-visible {
  outline: 3px solid color-mix(in srgb, #405fe8 28%, transparent);
  outline-offset: 3px;
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
.save-spinner { width: 17px; height: 17px; animation: save-spin .8s linear infinite; }
@keyframes save-spin { to { transform: rotate(360deg); } }
.btn.ghost {
  background: transparent;
}
.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
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
.help summary::-webkit-details-marker { display: none; }
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
.help-body p { margin: 0 0 10px; }
.help-body ol {
  margin: 0;
  padding-left: 1.25em;
}
.help-body li { margin-bottom: 4px; }
.split.editors {
  align-items: start;
}
.split.editors .field {
  margin-bottom: 0;
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
  transition: background 0.15s, border-color 0.15s, color 0.15s;
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
  opacity: 0.55;
  cursor: wait;
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
.dot.ok { background: var(--green); }
.dot.bad { background: var(--red); }
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

.security-card { margin-bottom: 18px; }
.password-warning { margin: 0 0 14px; padding: 12px 14px; border: 1px solid color-mix(in srgb, var(--warn) 45%, var(--line)); border-radius: var(--radius-sm); background: var(--warn-soft); color: var(--text); font-size: 13px; }
.password-warning p { margin: 5px 0 0; color: var(--muted); line-height: 1.5; }
.password-change-form { max-width: 620px; }
.password-change-form .actions { margin-top: 10px; }
.timezone-presets { margin: 8px 0 0; }
.timezone-picker { position:relative; }
.timezone-options-menu { position:absolute; z-index:30; top:calc(100% + 5px); left:0; right:0; max-height:270px; overflow:auto; padding:5px; border:1px solid var(--line); border-radius:10px; background:var(--surface); box-shadow:var(--shadow); }
.timezone-option { display:flex; align-items:center; justify-content:space-between; gap:12px; width:100%; min-height:44px; padding:9px 10px; border:0; border-radius:7px; background:transparent; color:var(--text); text-align:left; cursor:pointer; }
.timezone-option:hover,.timezone-option[aria-selected="true"] { background:var(--accent-soft); color:var(--accent); }
.timezone-option span { font-size:12px; }
.timezone-option code { color:var(--muted); font-size:11px; white-space:nowrap; }
.timezone-no-results { margin:0; padding:12px 10px; color:var(--muted); font-size:12px; }
.mobile-timezone-trigger { display:none; }
.timezone-sheet-backdrop { display:none; }
@media (max-width:720px) {
  .desktop-timezone-picker { display:none; }
  .mobile-timezone-trigger { display:flex; align-items:center; justify-content:space-between; gap:12px; width:100%; min-height:46px; padding:10px 12px; border:1px solid var(--line); border-radius:8px; background:var(--surface-2); color:var(--text); font:inherit; text-align:left; }
  .mobile-timezone-trigger span:first-child { overflow-wrap:anywhere; }
  .mobile-timezone-trigger-icon { color:var(--muted); font-size:18px; }
  .timezone-sheet-backdrop { display:flex; position:fixed; z-index:1000; inset:0; align-items:flex-end; justify-content:center; padding:0; background:rgba(0,0,0,.48); }
  .timezone-sheet { display:flex; flex-direction:column; width:100%; max-height:min(82dvh,720px); padding:16px 16px max(16px,env(safe-area-inset-bottom)); border-radius:18px 18px 0 0; border:1px solid var(--line); border-bottom:0; background:var(--surface); box-shadow:0 -8px 32px rgba(0,0,0,.18); }
  .timezone-sheet-head { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:12px; }
  .timezone-sheet-head h3 { margin:0; font-size:16px; }
  .timezone-sheet-close { width:36px; height:36px; border:0; border-radius:8px; background:var(--surface-2); color:var(--text); font-size:24px; line-height:1; }
  .timezone-sheet-search { flex:0 0 auto; width:100%; min-height:44px; margin-bottom:10px; padding:10px 12px; border:1px solid var(--line); border-radius:8px; background:var(--surface-2); color:var(--text); font:inherit; font-size:16px; }
  .timezone-sheet-options { min-height:0; overflow-y:auto; overscroll-behavior:contain; -webkit-overflow-scrolling:touch; }
  .timezone-sheet .timezone-option { min-height:48px; }
  .timezone-sheet .timezone-option code { overflow-wrap:anywhere; white-space:normal; text-align:right; }
  .timezone-custom-option { border-top:1px solid var(--line); margin-top:4px; }
  .timezone-sheet-hint { margin:10px 0 0; color:var(--muted); font-size:12px; line-height:1.45; }
}
</style>
