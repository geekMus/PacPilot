<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import {
  api,
  type AppSettings,
  type GenerationLog,
} from "../api/client";
import AppHeader from "../components/AppHeader.vue";

const router = useRouter();
const loading = ref(true);
const saving = ref(false);
const flash = ref("");
const error = ref("");
const logs = ref<GenerationLog[]>([]);

const form = reactive({
  mode: "custom" as "custom" | "genpac",
  pacProxy: "",
  pacCompress: true,
  pacPrecise: false,
  gfwlistUrl: "",
  directListText: "",
  blockListText: "",
  cronSchedule: "",
  webhookSuccessUrl: "",
  webhookSuccessBody: "",
  webhookFailureUrl: "",
  webhookFailureBody: "",
});

function applySettings(s: AppSettings) {
  form.mode = s.mode;
  form.pacProxy = s.pacProxy;
  form.pacCompress = s.pacCompress;
  form.pacPrecise = s.pacPrecise;
  form.gfwlistUrl = s.gfwlistUrl;
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
    gfwlistUrl: form.gfwlistUrl,
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
      error.value = "后台未启用";
      return;
    }
    const session = await api.session();
    if (!session.loggedIn) {
      await router.replace("/admin/login");
      return;
    }
    const [settings, logList] = await Promise.all([
      api.settings(),
      api.logs(),
    ]);
    applySettings(settings);
    logs.value = logList;
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

async function save(andGenerate: boolean) {
  flash.value = "";
  error.value = "";
  saving.value = true;
  try {
    await api.saveSettings(toPayload());
    if (andGenerate) {
      const result = await api.generate();
      flash.value = result.success
        ? "配置已保存并生成成功"
        : `配置已保存，生成失败: ${result.message}`;
    } else {
      flash.value = "配置已保存";
    }
    logs.value = await api.logs();
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
    flash.value = result.success
      ? "PAC 生成成功"
      : `生成失败: ${result.message}`;
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
      <a href="/proxy.pac">PAC 原文 ↗</a>
      <button type="button" class="linkish" @click="logout">退出</button>
    </AppHeader>

    <section class="hero">
      <div class="kicker">ADMIN</div>
      <h1>配置管理</h1>
      <p class="intro">
        业务参数持久化到 SQLite。保存后可立即重新生成 PAC。
      </p>
    </section>

    <p v-if="loading" class="muted">加载中…</p>
    <div v-if="flash" class="alert ok">{{ flash }}</div>
    <div v-if="error" class="alert">{{ error }}</div>

    <template v-if="!loading && !error.includes('未启用')">
      <form class="grid" @submit.prevent="save(false)">
        <section class="card">
          <h2>启动模式</h2>
          <label class="radio">
            <input v-model="form.mode" type="radio" value="custom" />
            自定义规则 PAC
          </label>
          <p class="hint">
            使用直连列表 / 黑名单，默认走代理；内网永远直连。
          </p>
          <label class="radio">
            <input v-model="form.mode" type="radio" value="genpac" />
            genpac（GFWList）
          </label>
          <p class="hint">
            调用 genpac 根据 GFWList 生成；自定义列表在此模式下不生效。
          </p>
        </section>

        <section class="card">
          <h2>代理与 genpac</h2>
          <label>PAC 代理字符串</label>
          <input
            v-model="form.pacProxy"
            placeholder="SOCKS5 127.0.0.1:1080; DIRECT"
          />
          <label>GFWList URL（genpac 模式）</label>
          <input v-model="form.gfwlistUrl" />
          <div class="row">
            <label class="check">
              <input v-model="form.pacCompress" type="checkbox" />
              压缩 PAC
            </label>
            <label class="check">
              <input v-model="form.pacPrecise" type="checkbox" />
              精确模式
            </label>
          </div>
        </section>

        <section class="card">
          <h2>自定义规则（仅 custom 模式）</h2>
          <label>直连列表（每行一个域名）</label>
          <textarea
            v-model="form.directListText"
            rows="6"
            placeholder="baidu.com&#10;*.cn"
          />
          <label>黑名单（每行一个）</label>
          <textarea v-model="form.blockListText" rows="6" />
        </section>

        <section class="card">
          <h2>定时与 Webhook</h2>
          <label>Cron 表达式（空则不定时）</label>
          <input v-model="form.cronSchedule" placeholder="0 0 */3 * *" />
          <label>成功 Webhook URL</label>
          <input v-model="form.webhookSuccessUrl" />
          <label>成功 Webhook Body（JSON）</label>
          <textarea v-model="form.webhookSuccessBody" rows="4" />
          <label>失败 Webhook URL</label>
          <input v-model="form.webhookFailureUrl" />
          <label>失败 Webhook Body（JSON）</label>
          <textarea v-model="form.webhookFailureBody" rows="4" />
        </section>

        <div class="actions">
          <button type="submit" :disabled="saving">保存配置</button>
          <button
            type="button"
            class="primary"
            :disabled="saving"
            @click="save(true)"
          >
            保存并立即生成 PAC
          </button>
          <button type="button" :disabled="saving" @click="generateOnly">
            仅重新生成
          </button>
        </div>
      </form>

      <section class="card">
        <h2>最近生成记录</h2>
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
                <td>{{ l.created_at }}</td>
                <td>{{ l.success ? "✅" : "❌" }}</td>
                <td>{{ l.mode }}</td>
                <td>{{ l.message }}</td>
              </tr>
              <tr v-if="!logs.length">
                <td colspan="4" class="muted">暂无记录</td>
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
  width: min(960px, calc(100% - 28px));
  margin: 28px auto 48px;
}
.hero {
  margin-bottom: 18px;
}
.kicker {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.14em;
  color: var(--accent);
}
h1 {
  margin: 4px 0 8px;
  font-size: 28px;
  letter-spacing: -0.03em;
}
.intro {
  color: var(--muted);
  margin: 0;
}
.card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 18px;
  margin-bottom: 14px;
  box-shadow: var(--shadow);
}
h2 {
  margin: 0 0 14px;
  font-size: 17px;
}
.hint {
  color: var(--muted);
  font-size: 12px;
  margin: 4px 0 12px;
}
label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  margin: 12px 0 6px;
}
.radio,
.check {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
  margin: 8px 0;
}
.row {
  display: flex;
  gap: 18px;
  flex-wrap: wrap;
  margin-top: 10px;
}
input,
textarea {
  width: 100%;
  border: 1px solid var(--line);
  background: var(--bg);
  color: var(--text);
  border-radius: 10px;
  padding: 10px 12px;
}
textarea {
  resize: vertical;
  font-family: ui-monospace, Consolas, monospace;
  font-size: 13px;
}
.actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin: 8px 0 18px;
}
button {
  appearance: none;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--text);
  border-radius: 10px;
  padding: 10px 14px;
  cursor: pointer;
}
button.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}
button:disabled {
  opacity: 0.6;
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
.alert {
  padding: 12px 14px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--red) 12%, var(--surface));
  border: 1px solid color-mix(in srgb, var(--red) 35%, var(--line));
  margin-bottom: 14px;
}
.alert.ok {
  background: color-mix(in srgb, var(--green) 12%, var(--surface));
  border-color: color-mix(in srgb, var(--green) 35%, var(--line));
}
.table-wrap {
  overflow: auto;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
th,
td {
  text-align: left;
  padding: 8px 6px;
  border-bottom: 1px solid var(--line);
  vertical-align: top;
}
th {
  color: var(--muted);
  font-weight: 600;
}
.muted {
  color: var(--muted);
}
</style>
