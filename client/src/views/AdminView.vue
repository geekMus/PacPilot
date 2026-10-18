<script setup lang="ts">
import { onMounted, reactive, ref, computed } from "vue";
import { useRouter } from "vue-router";
import {
  api,
  type AppSettings,
  type GenerationLog,
  type GenpacProbe,
} from "../api/client";
import AppHeader from "../components/AppHeader.vue";
import DomainListEditor from "../components/DomainListEditor.vue";
import WebhookBodyEditor from "../components/WebhookBodyEditor.vue";
import cronstrue from "cronstrue";
import { CronExpressionParser } from "cron-parser";
import "cronstrue/locales/zh_CN";

const router = useRouter();
const loading = ref(true);
const saving = ref(false);
const flash = ref("");
const flashOk = ref(true);
const error = ref("");
const logs = ref<GenerationLog[]>([]);
const genpacProbe = ref<GenpacProbe | null>(null);
const webhookTestState = reactive({
  success: { pending: false, ok: null as boolean | null, message: "" },
  failure: { pending: false, ok: null as boolean | null, message: "" },
});

const form = reactive({
  mode: "custom" as "custom" | "remote",
  pacProxy: "",
  pacCompress: true,
  pacPrecise: false,
  listUrl: "",
  directListText: "",
  blockListText: "",
  cronSchedule: "",
  webhookSuccessUrl: "",
  webhookSuccessBody: "",
  webhookFailureUrl: "",
  webhookFailureBody: "",
});

const successWebhookSample = JSON.stringify({ event: "pac.generated", ok: true }, null, 2);
const failureWebhookSample = JSON.stringify({ event: "pac.generation_failed", ok: false }, null, 2);

const modeHint = computed(() =>
  form.mode === "custom"
    ? "使用直连 / 黑名单列表，默认走代理；内网始终直连。"
    : "从你配置的远程 URL 拉取规则列表并生成 PAC（可用 GFWList，也可用其他域名列表）。"
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
  return `计划说明：${cronParse.value.description}。按服务端运行环境的时区执行。`;
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

const successBodyError = computed(() => jsonBodyError(form.webhookSuccessBody));

const failureBodyError = computed(() => jsonBodyError(form.webhookFailureBody));

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
  if (form.webhookSuccessUrl.trim() && !looksLikeUrl(form.webhookSuccessUrl.trim())) {
    errs.push("成功 Webhook URL 格式无效。");
  }
  if (form.webhookFailureUrl.trim() && !looksLikeUrl(form.webhookFailureUrl.trim())) {
    errs.push("失败 Webhook URL 格式无效。");
  }
  if (form.webhookSuccessUrl.trim() && successBodyError.value) {
    errs.push("成功 Webhook Body 必须是合法的 JSON 对象或数组。");
  }
  if (form.webhookFailureUrl.trim() && failureBodyError.value) {
    errs.push("失败 Webhook Body 必须是合法的 JSON 对象或数组。");
  }
  return errs;
});

const canSubmit = computed(() => formErrors.value.length === 0 && !saving.value);



function applySettings(s: AppSettings) {
  form.mode = s.mode;
  form.pacProxy = s.pacProxy;
  form.pacCompress = s.pacCompress;
  form.pacPrecise = s.pacPrecise;
  form.listUrl = s.listUrl;
  form.directListText = s.directList.join("\n");
  form.blockListText = s.blockList.join("\n");
  form.cronSchedule = s.cronSchedule;
  form.webhookSuccessUrl = s.webhookSuccessUrl;
  form.webhookSuccessBody = s.webhookSuccessBody;
  form.webhookFailureUrl = s.webhookFailureUrl;
  form.webhookFailureBody = s.webhookFailureBody;
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
    pacPrecise: form.pacPrecise,
    listUrl: form.listUrl,
    directList: split(form.directListText),
    blockList: split(form.blockListText),
    cronSchedule: form.cronSchedule,
    webhookSuccessUrl: form.webhookSuccessUrl,
    webhookSuccessBody: form.webhookSuccessBody,
    webhookFailureUrl: form.webhookFailureUrl,
    webhookFailureBody: form.webhookFailureBody,
  };
}

async function load() {
  loading.value = true;
  error.value = "";
  try {
    const meta = await api.meta();
    if (!meta.adminEnabled) {
      error.value = "后台未启用：请设置环境变量 ADMIN_PASSWORD";
      return;
    }
    const session = await api.session();
    if (!session.loggedIn) {
      await router.replace("/admin/login");
      return;
    }
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
  const url = kind === "success" ? form.webhookSuccessUrl.trim() : form.webhookFailureUrl.trim();
  const body = kind === "success" ? form.webhookSuccessBody : form.webhookFailureBody;
  const bodyError = kind === "success" ? successBodyError.value : failureBodyError.value;

  state.message = "";
  state.ok = null;
  if (!url) {
    state.ok = false;
    state.message = "请先填写 Webhook URL。";
    return;
  }
  if (!looksLikeUrl(url)) {
    state.ok = false;
    state.message = "URL 格式无效，请使用 HTTP(S) 地址且不要在 URL 中嵌入账号密码。";
    return;
  }
  if (bodyError) {
    state.ok = false;
    state.message = bodyError;
    return;
  }

  state.pending = true;
  try {
    const result = await api.testWebhook({ url, body });
    state.ok = result.success;
    state.message = result.success
      ? `测试请求已送达（HTTP ${result.status ?? "未知"}）。`
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

async function logout() {
  await api.logout();
  await router.push("/admin/login");
}
</script>

<template>
  <main class="page admin-page">
    <AppHeader brand="genpac-runner" sub="Admin">
      <RouterLink to="/">首页</RouterLink>
      <a href="/proxy.pac" target="_blank" rel="noopener noreferrer">查看 PAC</a>
      <button type="button" class="linkish" @click="logout">退出</button>
    </AppHeader>

    <section class="page-hero">
      <div class="page-kicker">控制台</div>
      <h1 class="page-title">配置管理</h1>
      <p class="page-intro">
        参数保存在本地数据库，保存后可立即重新生成 PAC。
      </p>
    </section>

    <p v-if="loading" class="state-msg">加载中…</p>
    <div v-if="flash" class="banner" :class="flashOk ? 'ok' : 'bad'">
      <span class="banner-icon" aria-hidden="true">{{ flashOk ? "✓" : "!" }}</span>
      <pre class="banner-text">{{ flash }}</pre>
    </div>
    <div v-if="error" class="banner bad">
      <span class="banner-icon" aria-hidden="true">!</span>
      <pre class="banner-text">{{ error }}</pre>
    </div>

    <template v-if="!loading && !error.includes('未启用')">
      <form class="stack" @submit.prevent="saveAndGenerate">
        <!-- 模式 -->
        <section class="card">
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
                <p class="mode-desc">从任意可访问的规则列表 URL 生成；命中走代理，其余直连。</p>
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
        <section class="card">
          <div class="card-head">
            <div class="card-title">
              <span class="icon-badge" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>
              </span>
              <div>
                <h2>代理与远程列表</h2>
                <p class="card-sub">PAC 返回的代理字符串与 GFWList 源</p>
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
          </div>
          <div class="field">
            <label for="listUrl">规则列表 URL <span class="lab-hint">GFWList / 明文域名 / ABP 规则均可</span></label>
            <input id="listUrl" v-model="form.listUrl" placeholder="https://example.com/list.txt" />
          </div>
          <div class="checks">
            <label class="check">
              <input v-model="form.pacCompress" type="checkbox" />
              <span>压缩 PAC</span>
            </label>
            <label class="check">
              <input v-model="form.pacPrecise" type="checkbox" />
              <span>精确模式</span>
            </label>
          </div>
        </section>

        <!-- 规则列表 -->
        <section class="card">
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
              <p><strong>写法：</strong>每行一条规则。支持完整域名 <code>example.com</code>，或通配 <code>*.example.com</code>。<code>#</code> 开头为注释（保存时仍会保留在文本里，生成时请勿依赖注释行作为规则）。</p>
              <p><strong>直连列表：</strong>命中后返回 <code>DIRECT</code>（不走代理）。</p>
              <p><strong>黑名单：</strong>命中后返回 <code>PROXY 0.0.0.0:0</code>（连接被拒绝，常用于屏蔽广告/追踪域名）。</p>
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
        <section class="card">
          <div class="card-head">
            <div class="card-title">
              <span class="icon-badge" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
              </span>
              <div>
                <h2>定时与 Webhook</h2>
                <p class="card-sub">均可选。定时控制自动生成；Webhook 在每次生成成功/失败时 POST 通知</p>
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
            <div class="webhook-panel ok">
              <div class="webhook-panel-title">
                <span class="webhook-panel-label"><span class="dot ok" />成功时通知</span>
                <button type="button" class="webhook-test-button" :disabled="webhookTestState.success.pending" @click="testWebhook('success')">
                  {{ webhookTestState.success.pending ? "发送中…" : "发送测试" }}
                </button>
              </div>
              <div class="field">
                <label>Webhook URL</label>
                <input
                  v-model="form.webhookSuccessUrl"
                  class="mono"
                  type="url"
                  inputmode="url"
                  placeholder="https://example.com/hooks/success"
                  spellcheck="false"
                />
              </div>
              <div class="field">
                <label>请求 Body <span class="lab-hint">JSON，可空</span></label>
                <WebhookBodyEditor
                  v-model="form.webhookSuccessBody"
                  :height="220"
                  :sample="successWebhookSample"
                  placeholder="输入 JSON 对象或数组…"
                />
                <p class="field-hint">留空时发送 {"ok":true}；自定义内容按 application/json 原样 POST。</p>
              </div>
              <p v-if="webhookTestState.success.message" class="webhook-test-result" :class="webhookTestState.success.ok ? 'ok' : 'bad'" role="status">
                {{ webhookTestState.success.message }}
              </p>
            </div>

            <div class="webhook-panel bad">
              <div class="webhook-panel-title">
                <span class="webhook-panel-label"><span class="dot bad" />失败时通知</span>
                <button type="button" class="webhook-test-button" :disabled="webhookTestState.failure.pending" @click="testWebhook('failure')">
                  {{ webhookTestState.failure.pending ? "发送中…" : "发送测试" }}
                </button>
              </div>
              <div class="field">
                <label>Webhook URL</label>
                <input
                  v-model="form.webhookFailureUrl"
                  class="mono"
                  type="url"
                  inputmode="url"
                  placeholder="https://example.com/hooks/failure"
                  spellcheck="false"
                />
              </div>
              <div class="field">
                <label>请求 Body <span class="lab-hint">JSON，可空</span></label>
                <WebhookBodyEditor
                  v-model="form.webhookFailureBody"
                  :height="220"
                  :sample="failureWebhookSample"
                  placeholder="输入 JSON 对象或数组…"
                />
                <p class="field-hint">留空时发送 {"ok":false}；仅当失败通知 URL 非空时才会请求。</p>
              </div>
              <p v-if="webhookTestState.failure.message" class="webhook-test-result" :class="webhookTestState.failure.ok ? 'ok' : 'bad'" role="status">
                {{ webhookTestState.failure.message }}
              </p>
            </div>
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
              class="btn primary"
              :disabled="!canSubmit"
            >
              {{ saving ? "保存并生成中…" : "保存并生成 PAC" }}
            </button>
          </div>
          <p class="actions-hint">
            将写入配置并立即按当前模式重新生成 PAC。校验未通过时按钮不可用。
          </p>
        </div>
      </form>

      <section class="card">
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
                <td class="msg">{{ l.message }}</td>
              </tr>
              <tr v-if="!logs.length">
                <td colspan="4" class="empty">暂无记录</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </main>
</template>

<style scoped>
.admin-page {
  padding-bottom: var(--space-6);
}
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
  color: #fff;
}
.btn.primary:hover:not(:disabled) {
  filter: brightness(1.05);
}
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
  word-break: break-word;
  white-space: pre-wrap;
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

</style>
