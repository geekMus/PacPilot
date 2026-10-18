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

const router = useRouter();
const loading = ref(true);
const saving = ref(false);
const flash = ref("");
const flashOk = ref(true);
const error = ref("");
const logs = ref<GenerationLog[]>([]);
const genpacProbe = ref<GenpacProbe | null>(null);

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

const modeHint = computed(() =>
  form.mode === "custom"
    ? "使用直连 / 黑名单列表，默认走代理；内网始终直连。"
    : "从你配置的远程 URL 拉取规则列表并生成 PAC（可用 GFWList，也可用其他域名列表）。"
);

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

async function save(andGenerate: boolean) {
  flash.value = "";
  error.value = "";
  saving.value = true;
  try {
    await api.saveSettings(toPayload());
    if (andGenerate) {
      const result = await api.generate();
      showFlash(
        result.success
          ? "配置已保存，PAC 生成成功"
          : `配置已保存，但生成失败：${result.message}`,
        result.success
      );
    } else {
      showFlash("配置已保存");
    }
    logs.value = await api.logs();
    genpacProbe.value = await api.genpacStatus().catch(() => genpacProbe.value);
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    saving.value = false;
  }
}

async function generateOnly() {
  flash.value = "";
  error.value = "";
  saving.value = true;
  try {
    const result = await api.generate();
    showFlash(
      result.success ? "PAC 生成成功" : `生成失败：${result.message}`,
      result.success
    );
    logs.value = await api.logs();
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    saving.value = false;
  }
}

async function logout() {
  await api.logout();
  await router.push("/admin/login");
}
</script>

<template>
  <main class="wrap">
    <AppHeader brand="genpac-runner" sub="ADMIN">
      <RouterLink to="/status">规则状态</RouterLink>
      <a href="/proxy.pac">PAC 原文</a>
      <button type="button" class="linkish" @click="logout">退出</button>
    </AppHeader>

    <section class="hero">
      <div class="kicker">控制台</div>
      <h1>配置管理</h1>
      <p class="intro">
        业务参数保存在 SQLite。修改后可立即重新生成 PAC。
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
      <form class="stack" @submit.prevent="save(false)">
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
                <p class="card-sub">仅在「自定义规则」模式下写入 PAC</p>
              </div>
            </div>
          </div>

          <div class="split">
            <div class="field">
              <label for="directList">直连列表 <span class="lab-hint">每行一个域名</span></label>
              <textarea
                id="directList"
                v-model="form.directListText"
                rows="7"
                placeholder="baidu.com&#10;*.cn"
              />
            </div>
            <div class="field">
              <label for="blockList">黑名单 <span class="lab-hint">命中返回 PROXY 0.0.0.0:0</span></label>
              <textarea id="blockList" v-model="form.blockListText" rows="7" />
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
                <p class="card-sub">可选；留空则不定时、不通知</p>
              </div>
            </div>
          </div>

          <div class="field">
            <label for="cron">Cron 表达式</label>
            <input id="cron" v-model="form.cronSchedule" placeholder="0 0 */3 * *" />
          </div>
          <div class="split">
            <div class="field">
              <label>成功 Webhook URL</label>
              <input v-model="form.webhookSuccessUrl" />
            </div>
            <div class="field">
              <label>失败 Webhook URL</label>
              <input v-model="form.webhookFailureUrl" />
            </div>
          </div>
          <div class="split">
            <div class="field">
              <label>成功 Body（JSON）</label>
              <textarea v-model="form.webhookSuccessBody" rows="4" />
            </div>
            <div class="field">
              <label>失败 Body（JSON）</label>
              <textarea v-model="form.webhookFailureBody" rows="4" />
            </div>
          </div>
        </section>

        <div class="actions">
          <button type="submit" class="btn" :disabled="saving">保存配置</button>
          <button
            type="button"
            class="btn primary"
            :disabled="saving"
            @click="save(true)"
          >
            保存并生成 PAC
          </button>
          <button type="button" class="btn ghost" :disabled="saving" @click="generateOnly">
            仅重新生成
          </button>
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
.wrap {
  width: min(920px, calc(100% - 32px));
  margin: 28px auto 56px;
}
.hero {
  margin-bottom: var(--space-5);
}
.kicker {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--accent);
}
h1 {
  margin: 6px 0 8px;
  font-size: 28px;
  letter-spacing: -0.03em;
  line-height: 1.2;
}
.intro {
  margin: 0;
  color: var(--muted);
  max-width: 36em;
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
  gap: var(--space-4);
}
.card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: var(--space-4) var(--space-5);
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
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  background: var(--accent-soft);
  color: var(--accent);
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
  box-shadow: 0 0 0 3px var(--accent-soft);
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
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-top: 4px;
}
.check {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  cursor: pointer;
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
  padding: 10px 16px;
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
  .card {
    padding: 16px;
  }
}
</style>
