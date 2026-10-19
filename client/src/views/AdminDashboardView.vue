<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import {
  api,
  type AdminSession,
  type AppSettings,
  type GenerationLog,
  type GenpacProbe,
  type Meta,
  type MonitorSummary,
  type PacStatus,
} from "../api/client";
import AdminLayout from "../components/AdminLayout.vue";
import AppFooter from "../components/AppFooter.vue";

const router = useRouter();
const loading = ref(true);
const refreshing = ref(false);
const generating = ref(false);
const error = ref("");
const notice = ref("");
const noticeOkay = ref(true);
const session = ref<AdminSession | null>(null);
const settings = ref<AppSettings | null>(null);
const status = ref<PacStatus | null>(null);
const logs = ref<GenerationLog[]>([]);
const meta = ref<Meta | null>(null);
const monitor = ref<MonitorSummary | null>(null);
const engine = ref<GenpacProbe | null>(null);

const modeLabel = computed(() => settings.value?.mode === "remote" ? "远程规则列表" : "自定义规则");
const customRuleCount = computed(() => (settings.value?.directList.length ?? 0) + (settings.value?.blockList.length ?? 0));
const maxTrendRequests = computed(() => Math.max(1, ...(monitor.value?.requestTrend ?? []).map((item) => item.requests)));
const latestLog = computed(() => logs.value[0] ?? null);

function formatTrendHour(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: settings.value?.timezone || "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).format(date);
}
function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone: settings.value?.timezone || "Asia/Shanghai",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(date);
  } catch {
    return value;
  }
}
function modeForLog(value: string): string {
  return value === "remote" ? "远程规则列表" : value === "custom" ? "自定义规则" : value;
}

async function loadOverview(): Promise<void> {
  loading.value = !settings.value;
  refreshing.value = true;
  error.value = "";
  try {
    const nextSession: AdminSession = await api.session();
    session.value = nextSession;
    if (!nextSession.loggedIn) {
      await router.replace("/admin/login");
      return;
    }
    if (nextSession.mustChangePassword) {
      await router.replace("/admin");
      return;
    }

    const [nextSettings, nextStatus, nextLogs, nextMeta, nextMonitor, nextEngine] = await Promise.all([
      api.settings(),
      api.status(),
      api.logs(),
      api.meta(),
      api.monitorSummary().catch(() => null),
      api.genpacStatus().catch(() => null),
    ]);
    settings.value = nextSettings;
    status.value = nextStatus;
    logs.value = nextLogs.slice(0, 6);
    meta.value = nextMeta;
    monitor.value = nextMonitor;
    engine.value = nextEngine;
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : String(caught);
  } finally {
    loading.value = false;
    refreshing.value = false;
  }
}
async function generateNow(): Promise<void> {
  if (generating.value) return;
  generating.value = true;
  notice.value = "";
  error.value = "";
  try {
    const result = await api.generate();
    noticeOkay.value = result.success;
    notice.value = result.success ? "PAC 已重新生成。" : "PAC 生成失败：" + result.message;
    await loadOverview();
  } catch (caught) {
    noticeOkay.value = false;
    error.value = caught instanceof Error ? caught.message : String(caught);
  } finally {
    generating.value = false;
  }
}
async function logout(): Promise<void> {
  try {
    await api.logout();
  } finally {
    await router.replace("/admin/login");
  }
}

onMounted(() => { void loadOverview(); });
</script>

<template>
  <AdminLayout active="dashboard" title="系统总览" subtitle="查看 PAC 配置、生成状态、访问情况与常用管理入口。">
    <template #actions>
      <span v-if="meta" class="version-chip">版本 {{ meta.version }}</span>
      <button class="dash-button secondary" type="button" :disabled="refreshing" @click="loadOverview">
        {{ refreshing ? "刷新中…" : "刷新数据" }}
      </button>
      <button class="dash-button logout-button" type="button" @click="logout">退出登录</button>
    </template>

    <div class="dashboard-view">
      <div class="welcome-row">
        <div>
          <p class="section-eyebrow">工作台 / OVERVIEW</p>
          <h2>管理概览</h2>
          <p class="welcome-copy">集中查看当前 PAC 的工作状态，并快速进入配置、监控或文件查看页面。</p>
        </div>
        <div class="quick-actions">
          <RouterLink to="/admin" class="dash-button secondary">打开配置</RouterLink>
          <RouterLink to="/admin/monitor" class="dash-button secondary">查看网络监控</RouterLink>
          <button type="button" class="dash-button primary" :disabled="generating || loading" @click="generateNow">
            {{ generating ? "正在生成…" : "立即生成 PAC" }}
          </button>
        </div>
      </div>

      <div v-if="error" class="dashboard-alert is-error" role="alert">
        <strong>读取管理状态失败</strong><span>{{ error }}</span>
        <button type="button" @click="loadOverview">重新加载</button>
      </div>
      <div v-if="notice" class="dashboard-alert" :class="noticeOkay ? 'is-success' : 'is-error'" role="status">{{ notice }}</div>
      <div v-if="session?.isDefaultPassword" class="dashboard-alert is-warning" role="alert">
        <strong>安全提醒</strong><span>当前仍使用默认管理密码 password。</span>
        <RouterLink to="/admin#security">立即修改</RouterLink>
      </div>

      <section class="overview-metrics" aria-label="关键状态">
        <article class="overview-metric">
          <div class="metric-top"><span class="metric-label">PAC 文件状态</span><span class="metric-icon" aria-hidden="true">P</span></div>
          <strong class="metric-value" :class="status?.hasPac ? 'value-good' : 'value-warning'">{{ loading ? "读取中…" : status?.hasPac ? "已生成" : "尚未生成" }}</strong>
          <span class="metric-note">{{ status?.hasPac ? "已存在可供客户端获取的规则文件" : "请保存配置并生成 PAC 文件" }}</span>
        </article>
        <article class="overview-metric">
          <div class="metric-top"><span class="metric-label">当前生成模式</span><span class="metric-icon" aria-hidden="true">↔</span></div>
          <strong class="metric-value">{{ loading ? "读取中…" : modeLabel }}</strong>
          <span class="metric-note">{{ settings?.mode === "remote" ? "按远程列表匹配域名规则" : "使用自定义直连、黑名单及默认代理" }}</span>
        </article>
        <article class="overview-metric">
          <div class="metric-top"><span class="metric-label">自定义规则</span><span class="metric-icon" aria-hidden="true">≡</span></div>
          <strong class="metric-value">{{ customRuleCount }}</strong>
          <span class="metric-note">直连 {{ settings?.directList.length ?? 0 }} 条 · 黑名单 {{ settings?.blockList.length ?? 0 }} 条</span>
        </article>
        <article class="overview-metric">
          <div class="metric-top"><span class="metric-label">近 1 小时请求</span><span class="metric-icon" aria-hidden="true">⌁</span></div>
          <strong class="metric-value">{{ monitor ? monitor.requestsLastHour : "—" }}</strong>
          <span class="metric-note">网页、PAC 与 API 请求，不代表代理转发流量</span>
        </article>
      </section>

      <section class="overview-grid">
        <article class="dashboard-panel">
          <header class="panel-header">
            <div><h3>当前配置</h3><p>系统正在使用的主要设置</p></div>
            <RouterLink to="/admin">编辑配置 <span aria-hidden="true">↗</span></RouterLink>
          </header>
          <div class="config-details">
            <div class="config-detail"><span>生成模式</span><strong>{{ modeLabel }}</strong></div>
            <div class="config-detail"><span>配置时区</span><strong>{{ settings?.timezone || "—" }}</strong></div>
            <div class="config-detail"><span>默认代理</span><code>{{ settings?.pacProxy || "—" }}</code></div>
            <div class="config-detail"><span>定时生成</span><strong>{{ settings?.cronSchedule ? settings.cronSchedule : "已关闭" }}</strong></div>
            <div class="config-detail"><span>远程规则地址</span><code>{{ settings?.mode === "remote" ? settings.listUrl : "当前未启用" }}</code></div>
            <div class="config-detail"><span>生成引擎</span><strong :class="engine?.available ? 'value-good' : 'value-warning'">{{ engine ? engine.available ? "可用" : "需检查" : "未检测" }}</strong></div>
            <div class="config-detail"><span>最近生成时间</span><strong>{{ latestLog ? formatDate(latestLog.created_at) : status?.updatedAt || "暂无记录" }}</strong></div>
            <div class="config-detail"><span>生成结果</span><strong :class="latestLog?.success ? 'value-good' : latestLog ? 'value-warning' : ''">{{ latestLog ? latestLog.success ? "成功" : "失败" : "暂无记录" }}</strong></div>
          </div>
          <div class="panel-footer-links">
            <a href="/proxy.pac" target="_blank" rel="noopener noreferrer">直接查看 proxy.pac <span aria-hidden="true">↗</span></a>
            <RouterLink to="/">打开公共状态页 <span aria-hidden="true">↗</span></RouterLink>
          </div>
        </article>

        <article class="dashboard-panel">
          <header class="panel-header">
            <div><h3>最近生成记录</h3><p>最近 6 条记录，便于快速定位失败原因</p></div>
            <RouterLink to="/admin#logs">查看记录 <span aria-hidden="true">↗</span></RouterLink>
          </header>
          <div v-if="logs.length" class="table-scroll">
            <table class="recent-table">
              <thead><tr><th>时间</th><th>结果</th><th>模式</th><th>信息</th></tr></thead>
              <tbody>
                <tr v-for="entry in logs" :key="entry.id">
                  <td class="nowrap">{{ formatDate(entry.created_at) }}</td>
                  <td><span class="result-pill" :class="entry.success ? 'good' : 'bad'">{{ entry.success ? "成功" : "失败" }}</span></td>
                  <td>{{ modeForLog(entry.mode) }}</td>
                  <td class="log-message" :title="entry.message || ''">{{ entry.message || "—" }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-else class="panel-empty">{{ loading ? "正在读取生成记录…" : "暂无生成记录。" }}</div>
        </article>
      </section>

      <section class="dashboard-panel activity-panel">
        <header class="panel-header">
          <div><h3>近 24 小时访问趋势</h3><p>按小时汇总 genpac-runner 收到的请求；不等同于代理服务端的流量。</p></div>
          <RouterLink to="/admin/monitor">详细监控 <span aria-hidden="true">↗</span></RouterLink>
        </header>
        <div v-if="monitor?.requestTrend?.length" class="overview-trend" role="img" aria-label="近 24 小时访问趋势">
          <div v-for="(point, index) in monitor.requestTrend" :key="point.hour" class="overview-trend-column" :title="formatTrendHour(point.hour) + '：' + point.requests + ' 次请求，' + point.errors + ' 次错误'">
            <div class="overview-trend-bar-area">
              <div class="overview-trend-bar" :style="{ height: (point.requests / maxTrendRequests * 100) + '%' }"></div>
              <div v-if="point.errors" class="overview-trend-errors" :style="{ height: (point.errors / maxTrendRequests * 100) + '%' }"></div>
            </div>
            <span>{{ index % 6 === 0 || index === monitor.requestTrend.length - 1 ? formatTrendHour(point.hour) : "" }}</span>
          </div>
        </div>
        <div v-else class="panel-empty">暂无访问趋势数据；服务收到请求后会逐步形成统计。</div>
        <div class="trend-legend">
          <span><i class="trend-swatch"></i>请求量</span><span><i class="trend-swatch errors"></i>错误请求</span>
          <span class="trend-note">当前活动请求 {{ monitor?.activeRequests ?? "—" }} · 近 24 小时错误率 {{ monitor ? monitor.errorRate.toFixed(1) + "%" : "—" }}</span>
        </div>
      </section>

      <section class="dashboard-shortcuts">
        <RouterLink to="/admin#mode" class="shortcut-tile"><span class="shortcut-icon">↔</span><span><strong>启动模式</strong><small>自定义规则或远程列表</small></span><b>→</b></RouterLink>
        <RouterLink to="/admin#rules" class="shortcut-tile"><span class="shortcut-icon">≡</span><span><strong>域名规则</strong><small>管理直连与黑名单</small></span><b>→</b></RouterLink>
        <RouterLink to="/admin#schedule" class="shortcut-tile"><span class="shortcut-icon">◷</span><span><strong>定时与通知</strong><small>配置 Cron 与 Webhook</small></span><b>→</b></RouterLink>
      </section>
      <AppFooter />
    </div>
  </AdminLayout>
</template>

<style scoped>
.dashboard-view { min-width: 0; }
.welcome-row { display:flex; align-items:flex-end; justify-content:space-between; gap:22px; margin-bottom:22px; }
.section-eyebrow { margin:0 0 7px; color:var(--accent); font-size:10px; font-weight:800; letter-spacing:.13em; }
.welcome-row h2 { margin:0; font-size:clamp(22px,2.5vw,28px); line-height:1.2; letter-spacing:-.04em; }
.welcome-copy { margin:8px 0 0; color:var(--muted); font-size:12px; line-height:1.55; }
.quick-actions { display:flex; flex-wrap:wrap; gap:8px; }
.dash-button { display:inline-flex; align-items:center; justify-content:center; min-height:36px; padding:0 12px; border:1px solid var(--line); border-radius:8px; font:inherit; font-size:11px; font-weight:700; text-decoration:none; cursor:pointer; white-space:nowrap; transition:filter .15s,background .15s; }
.dash-button.secondary,.dash-button.logout-button { color:var(--text); background:var(--surface); }
.dash-button.primary { color:var(--accent-contrast); background:var(--accent); border-color:var(--accent); }
.dash-button:disabled { opacity:.55; cursor:wait; }
.dash-button:hover:not(:disabled) { filter:brightness(1.04); }
.version-chip { display:inline-flex; align-items:center; min-height:28px; padding:0 9px; border:1px solid var(--line); border-radius:999px; background:var(--surface); color:var(--muted); font-size:10px; font-weight:700; white-space:nowrap; }
.dashboard-alert { display:flex; align-items:center; flex-wrap:wrap; gap:9px; padding:11px 13px; margin-bottom:14px; border:1px solid var(--line); border-radius:9px; background:var(--surface); font-size:12px; line-height:1.5; }
.dashboard-alert strong { font-weight:800; }
.dashboard-alert a { color:var(--accent); font-weight:700; text-decoration:none; }
.dashboard-alert button { margin-left:auto; border:0; color:var(--accent); background:none; font:inherit; font-weight:700; cursor:pointer; }
.dashboard-alert.is-error { border-color:color-mix(in srgb,var(--red) 30%,var(--line)); background:var(--red-soft); color:var(--red); }
.dashboard-alert.is-warning { border-color:color-mix(in srgb,var(--warn) 35%,var(--line)); background:var(--warn-soft); }
.dashboard-alert.is-success { border-color:color-mix(in srgb,var(--green) 30%,var(--line)); background:var(--green-soft); }
.overview-metrics { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:13px; margin-bottom:18px; }
.overview-metric { min-width:0; display:flex; flex-direction:column; gap:7px; padding:17px; border:1px solid var(--line); border-radius:12px; background:var(--surface); box-shadow:var(--shadow); }
.metric-top { display:flex; align-items:center; justify-content:space-between; gap:10px; }
.metric-label { color:var(--muted); font-size:11px; font-weight:700; }
.metric-icon { display:grid; place-items:center; width:30px; height:30px; border-radius:9px; background:var(--accent-soft); color:var(--accent); font-size:16px; }
.metric-value { display:block; font-size:clamp(20px,2.5vw,27px); line-height:1.2; letter-spacing:-.04em; overflow-wrap:anywhere; }
.value-good { color:var(--green); }
.value-warning { color:var(--warn); }
.metric-note { min-height:29px; color:var(--muted); font-size:10px; line-height:1.5; }
.overview-grid { display:grid; grid-template-columns:minmax(0,.92fr) minmax(0,1.08fr); align-items:start; gap:16px; margin-bottom:16px; }
.dashboard-panel { min-width:0; padding:19px; border:1px solid var(--line); border-radius:12px; background:var(--surface); box-shadow:var(--shadow); }
.panel-header { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:15px; }
.panel-header h3 { margin:0; font-size:14px; font-weight:800; letter-spacing:-.02em; }
.panel-header p { margin:5px 0 0; color:var(--muted); font-size:10px; line-height:1.5; }
.panel-header > a { flex:0 0 auto; color:var(--accent); font-size:10px; font-weight:750; text-decoration:none; white-space:nowrap; }
.config-details { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:0 15px; }
.config-detail { display:flex; flex-direction:column; gap:5px; min-width:0; padding:12px 0; border-bottom:1px solid var(--line); }
.config-detail > span { color:var(--muted); font-size:10px; font-weight:650; }
.config-detail strong,.config-detail code { color:var(--text); font-size:11px; font-weight:750; overflow-wrap:anywhere; line-height:1.5; }
.config-detail code { font-family:var(--font-mono); font-weight:600; }
.panel-footer-links { display:flex; flex-wrap:wrap; gap:9px 16px; margin-top:15px; }
.panel-footer-links a { color:var(--accent); font-size:10px; font-weight:700; text-decoration:none; }
.table-scroll { width:100%; overflow:auto; border:1px solid var(--line); border-radius:8px; }
.recent-table { width:100%; border-collapse:collapse; font-size:10px; }
.recent-table th { padding:10px; background:var(--surface-2); color:var(--muted); text-align:left; font-weight:800; white-space:nowrap; border-bottom:1px solid var(--line); }
.recent-table td { padding:10px; border-bottom:1px solid var(--line); vertical-align:middle; }
.recent-table tr:last-child td { border-bottom:0; }
.recent-table tbody tr:hover { background:color-mix(in srgb,var(--accent) 4%,transparent); }
.nowrap { white-space:nowrap; }
.log-message { min-width:135px; max-width:220px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--muted); }
.result-pill { display:inline-flex; border:1px solid var(--line); border-radius:999px; padding:3px 7px; font-size:9px; font-weight:800; white-space:nowrap; }
.result-pill.good { color:var(--green); background:var(--green-soft); border-color:color-mix(in srgb,var(--green) 24%,var(--line)); }
.result-pill.bad { color:var(--red); background:var(--red-soft); border-color:color-mix(in srgb,var(--red) 24%,var(--line)); }
.panel-empty { padding:24px 12px; border:1px dashed var(--line); border-radius:8px; color:var(--muted); text-align:center; font-size:11px; }
.activity-panel { margin-bottom:16px; }
.overview-trend { display:grid; grid-template-columns:repeat(24,minmax(0,1fr)); gap:5px; align-items:end; padding-top:7px; }
.overview-trend-column { display:flex; flex-direction:column; min-width:0; align-items:center; gap:7px; color:var(--muted); font-size:9px; }
.overview-trend-bar-area { position:relative; display:flex; align-items:flex-end; width:100%; height:100px; overflow:hidden; border-radius:5px 5px 0 0; background:var(--surface-2); }
.overview-trend-bar,.overview-trend-errors { position:absolute; bottom:0; left:15%; right:15%; border-radius:4px 4px 0 0; }
.overview-trend-bar { background:var(--accent); opacity:.9; }
.overview-trend-errors { background:var(--red); opacity:.95; min-height:2px; }
.trend-legend { display:flex; flex-wrap:wrap; align-items:center; gap:13px; margin-top:15px; color:var(--muted); font-size:10px; }
.trend-legend > span { display:inline-flex; align-items:center; gap:6px; }
.trend-swatch { width:8px; height:8px; border-radius:3px; background:var(--accent); }
.trend-swatch.errors { background:var(--red); }
.trend-note { margin-left:auto; }
.dashboard-shortcuts { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; margin-bottom:22px; }
.shortcut-tile { display:flex; align-items:center; gap:10px; min-width:0; padding:13px; border:1px solid var(--line); border-radius:10px; background:var(--surface); text-decoration:none; transition:border-color .15s,transform .15s; }
.shortcut-tile:hover { border-color:color-mix(in srgb,var(--accent) 40%,var(--line)); transform:translateY(-1px); }
.shortcut-icon { display:grid; place-items:center; flex:0 0 32px; width:32px; height:32px; border-radius:9px; background:var(--surface-2); color:var(--accent); font-size:17px; }
.shortcut-tile > span:nth-child(2) { display:flex; flex-direction:column; gap:3px; min-width:0; }
.shortcut-tile strong { color:var(--text); font-size:11px; }
.shortcut-tile small { color:var(--muted); font-size:9px; line-height:1.4; }
.shortcut-tile b { margin-left:auto; color:var(--muted); }
@media (max-width:1240px) { .overview-metrics { grid-template-columns:repeat(2,minmax(0,1fr)); } .overview-grid { grid-template-columns:1fr; } }
@media (max-width:760px) { .welcome-row { flex-direction:column; align-items:flex-start; } .quick-actions { width:100%; } .quick-actions .dash-button { flex:1; } .dashboard-shortcuts { grid-template-columns:1fr; } .config-details { gap:0 11px; } }
@media (max-width:500px) { .overview-metrics { gap:8px; } .overview-metric { padding:12px; } .metric-value { font-size:18px; } .metric-note { font-size:9px; } .dashboard-panel { padding:13px; } .recent-table { min-width:560px; } .overview-trend { gap:2px; } .overview-trend-bar-area { height:72px; } .trend-note { margin-left:0; flex-basis:100%; } .panel-header { align-items:flex-start; } }
</style>