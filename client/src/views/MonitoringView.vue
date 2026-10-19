<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import {
  api,
  type AccessEvent,
  type AdminSession,
  type MonitorSummary,
  type ProxyProbeBatch,
  type ProxyProbeRecord,
} from "../api/client";
import AdminLayout from "../components/AdminLayout.vue";
import AppFooter from "../components/AppFooter.vue";
import ResponsiveTrendChart from "../components/ResponsiveTrendChart.vue";
import TextDetail from "../components/TextDetail.vue";

const router = useRouter();
const summary = ref<MonitorSummary | null>(null);
const accesses = ref<AccessEvent[]>([]);
const probeHistory = ref<ProxyProbeRecord[]>([]);
const latestProbe = ref<ProxyProbeBatch | null>(null);
const loading = ref(true);
const authChecking = ref(true);
const refreshing = ref(false);
const probing = ref(false);
const error = ref("");
const refreshError = ref("");
const probeError = ref("");
const lastUpdated = ref("");
let refreshTimer: ReturnType<typeof setInterval> | undefined;

const timeZone = computed(() => summary.value?.timezone || "Asia/Shanghai");

const revealSourceAddresses = ref(false);

function formatSourceAddress(address: string): string {
  if (revealSourceAddresses.value || address === "unknown") return address;
  const ipv4 = address.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) return ipv4[1] + "." + ipv4[2] + "." + ipv4[3] + ".*";
  if (address.includes(":")) {
    const groups = address.split(":").filter(Boolean);
    return groups.slice(0, 4).join(":") + (groups.length > 4 ? ":…" : "");
  }
  return address;
}

async function refreshDashboard(silent = false): Promise<void> {
  if (refreshing.value) return;
  refreshing.value = true;
  if (!silent) error.value = "";
  try {
    const [nextSummary, nextAccesses] = await Promise.all([
      api.monitorSummary(),
      api.monitorAccess(50),
    ]);
    summary.value = nextSummary;
    accesses.value = nextAccesses;
    lastUpdated.value = new Date().toISOString();
    refreshError.value = "";
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    if (silent && summary.value) refreshError.value = message;
    else error.value = message;
  } finally {
    refreshing.value = false;
    loading.value = false;
  }
}

async function loadProbeHistory(): Promise<void> {
  try {
    probeHistory.value = await api.proxyProbeHistory(30);
  } catch (caught) {
    probeError.value = caught instanceof Error ? caught.message : String(caught);
  }
}

async function runProxyTest(): Promise<void> {
  if (probing.value) return;
  probing.value = true;
  probeError.value = "";
  latestProbe.value = null;
  try {
    latestProbe.value = await api.testProxies();
    await loadProbeHistory();
    await refreshDashboard(true);
  } catch (caught) {
    probeError.value = caught instanceof Error ? caught.message : String(caught);
    await loadProbeHistory();
  } finally {
    probing.value = false;
  }
}

async function logout(): Promise<void> {
  try {
    await api.logout();
  } finally {
    await router.replace("/admin/login");
  }
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone: timeZone.value,
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

function formatDuration(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  if (value >= 1000) return (value / 1000).toFixed(2) + " s";
  return value.toFixed(1) + " ms";
}

function formatBytes(value: number | null | undefined): string {
  if (!value || value < 1) return "—";
  if (value < 1024) return value + " B";
  if (value < 1024 * 1024) return (value / 1024).toFixed(1) + " KiB";
  return (value / (1024 * 1024)).toFixed(2) + " MiB";
}

function categoryLabel(category: string): string {
  const labels: Record<string, string> = {
    page: "网页",
    pac: "PAC 文件",
    "public-api": "公开 API",
    "admin-api": "管理 API",
  };
  return labels[category] || category;
}

function statusLabel(code: number): string {
  if (code >= 500) return "服务端错误";
  if (code >= 400) return "客户端错误";
  if (code >= 300) return "重定向";
  return "成功";
}

function statusTone(code: number): string {
  if (code >= 500) return "bad";
  if (code >= 400) return "warn";
  return "good";
}

function probePhaseLabel(phase: string): string {
  const labels: Record<string, string> = {
    TCP: "TCP 连接",
    PROXY_TLS: "代理 TLS 握手",
    PROXY_HANDSHAKE: "代理协议握手",
    TARGET_TLS: "目标 TLS 握手",
    TARGET_HTTP: "目标 HTTP 请求",
    complete: "完成",
  };
  return labels[phase] || phase;
}

async function initialise(): Promise<void> {
  try {
    const session: AdminSession = await api.session();
    if (!session.loggedIn) {
      await router.replace("/admin/login");
      return;
    }
    if (session.mustChangePassword) {
      await router.replace("/admin");
      return;
    }
    authChecking.value = false;
    await Promise.all([refreshDashboard(), loadProbeHistory()]);
    refreshTimer = setInterval(() => { void refreshDashboard(true); }, 15000);
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : String(caught);
    loading.value = false;
    authChecking.value = false;
  }
}

onMounted(() => { void initialise(); });
onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer);
});
</script>

<template>
  <AdminLayout active="monitor" title="网络监控" subtitle="查看访问趋势、请求记录，并手动检测 PAC 代理节点。">
    <template #actions>
      <span v-if="lastUpdated" class="monitor-top-updated">
        <span class="live-dot" :class="{ busy: refreshing }"></span>
        更新于 {{ formatDate(lastUpdated) }}
      </span>
      <button class="monitor-button secondary" type="button" :disabled="refreshing" @click="refreshDashboard()">
        {{ refreshing ? "刷新中…" : "刷新数据" }}
      </button>
      <button class="monitor-button secondary" type="button" @click="logout">退出登录</button>
    </template>

    <div class="monitor-page">
      <div class="monitor-page-note">自动刷新间隔为 15 秒。请求统计仅包含 genpac-runner 自身接收的流量，不代表代理服务器的实际转发流量。</div>

    <section v-if="authChecking || loading" class="monitor-state" aria-live="polite">
      <span class="monitor-spinner"></span>
      <div><strong>正在读取监控数据</strong><p>正在加载访问统计与代理检测历史。</p></div>
    </section>

    <section v-else-if="error && !summary" class="monitor-state is-error" role="alert">
      <div><strong>无法读取监控数据</strong><p>{{ error }}</p></div>
      <button class="monitor-button secondary" type="button" @click="refreshDashboard()">重试</button>
    </section>

    <template v-else>
      <div v-if="error" class="monitor-alert is-error" role="alert">{{ error }}</div>
      <div v-if="refreshError" class="monitor-alert is-warning" role="status">后台自动刷新失败：{{ refreshError }}</div>

      <section class="metric-grid" aria-label="访问统计">
        <article class="metric-card">
          <span class="metric-label">活动 HTTP 请求</span>
          <strong class="metric-value">{{ summary?.activeRequests ?? 0 }}</strong>
          <span class="metric-note">当前正在处理的请求</span>
        </article>
        <article class="metric-card">
          <span class="metric-label">应用端 TCP 连接</span>
          <strong class="metric-value">{{ summary?.tcpConnections ?? 0 }}</strong>
          <span class="metric-note">包含 Keep-Alive 或反代连接</span>
        </article>
        <article class="metric-card">
          <span class="metric-label">近 1 小时请求</span>
          <strong class="metric-value">{{ summary?.requestsLastHour ?? 0 }}</strong>
          <span class="metric-note">网页、PAC 与 API 请求</span>
        </article>
        <article class="metric-card">
          <span class="metric-label">近 24 小时来源地址</span>
          <strong class="metric-value">{{ summary?.uniqueSourcesLast24h ?? 0 }}</strong>
          <span class="metric-note">按连接对端地址去重</span>
        </article>
        <article class="metric-card">
          <span class="metric-label">近 24 小时请求量</span>
          <strong class="metric-value">{{ summary?.requestsLast24h ?? 0 }}</strong>
          <span class="metric-note">不含监控轮询和静态资源</span>
        </article>
        <article class="metric-card">
          <span class="metric-label">近 24 小时错误率</span>
          <strong class="metric-value" :class="(summary?.errorRate ?? 0) >= 5 ? 'value-warn' : ''">
            {{ summary ? summary.errorRate.toFixed(1) + "%" : "0.0%" }}
          </strong>
          <span class="metric-note">HTTP 4xx/5xx · 5xx {{ summary?.serverErrorsLast24h ?? 0 }}</span>
        </article>
        <article class="metric-card">
          <span class="metric-label">平均响应时间</span>
          <strong class="metric-value">{{ formatDuration(summary?.averageResponseMs) }}</strong>
          <span class="metric-note">近 24 小时已记录请求</span>
        </article>
        <article class="metric-card">
          <span class="metric-label">P95 响应时间</span>
          <strong class="metric-value">{{ formatDuration(summary?.p95ResponseMs) }}</strong>
          <span class="metric-note">近 24 小时样本的第 95 百分位</span>
        </article>
      </section>

      <section class="monitor-panel trend-panel">
        <div class="panel-heading">
          <div>
            <h2>最近 24 小时请求趋势</h2>
            <p>按小时汇总网页、PAC 与 API 请求；红色部分代表 HTTP 4xx/5xx。当前小时尚未结束，计数可能继续增长。</p>
          </div>
          <span class="panel-count">峰值 {{ Math.max(0, ...(summary?.requestTrend ?? []).map((item) => item.requests)) }} 次/小时</span>
        </div>
        <ResponsiveTrendChart
          v-if="summary?.requestTrend?.length"
          :points="summary.requestTrend"
          :time-zone="timeZone"
          aria-label="最近 24 小时按小时统计的请求量和错误请求量"
        />
        <div v-else class="monitor-empty">暂无足够的请求记录；后续会逐步形成按小时统计的趋势。</div>
        <div class="trend-legend">
          <span><i class="legend-swatch request-swatch"></i>请求</span>
          <span><i class="legend-swatch error-swatch"></i>错误请求（包含在请求总量中）</span>
          <span class="trend-sample-note">响应时间的 P95 最多基于最近 5,000 条请求计算。</span>
        </div>
      </section>

      <section class="monitor-panel">
        <div class="panel-heading">
          <div>
            <h2>最近访问记录</h2>
            <p>最近 50 条有效请求。查询参数、Cookie 和请求正文不会被保存。</p>
          </div>
          <div class="panel-actions">
            <button class="monitor-button secondary" type="button" @click="revealSourceAddresses = !revealSourceAddresses">
              {{ revealSourceAddresses ? "隐藏完整 IP" : "显示完整 IP" }}
            </button>
            <span class="panel-count">{{ accesses.length }} 条</span>
          </div>
        </div>

        <div class="monitor-notice">
          <strong>来源地址说明：</strong>记录的是与应用建立 TCP 连接的对端地址。若使用 Cloudflare Tunnel、Lucky、Nginx 等反向代理，这里可能显示代理节点地址；当前版本不会盲目信任转发头，以免被伪造。
        </div>

        <div v-if="accesses.length === 0" class="monitor-empty">
          暂无访问记录。页面访问、PAC 文件请求和相关 API 请求会在本版本启用后开始记录。
        </div>
        <div v-else class="table-scroll">
          <table class="monitor-table">
            <thead>
              <tr>
                <th>时间</th>
                <th>来源地址</th>
                <th>类型</th>
                <th>请求路径</th>
                <th>状态</th>
                <th>耗时</th>
                <th>响应大小</th>
                <th>客户端</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="event in accesses" :key="event.id">
                <td class="nowrap">{{ formatDate(event.created_at) }}</td>
                <td><code>{{ formatSourceAddress(event.source_ip) }}</code></td>
                <td><span class="category-pill">{{ categoryLabel(event.category) }}</span></td>
                <td class="path-cell">
                  <span class="method-label">{{ event.method }}</span>
                  <TextDetail :text="event.path" label="请求路径"><code>{{ event.path }}</code></TextDetail>
                </td>
                <td><span class="status-pill" :class="statusTone(event.status_code)">{{ event.status_code }} {{ statusLabel(event.status_code) }}</span></td>
                <td class="nowrap">{{ formatDuration(event.duration_ms) }}</td>
                <td class="nowrap">{{ formatBytes(event.response_bytes) }}</td>
                <td class="ua-cell">
                  <TextDetail v-if="event.user_agent" :text="event.user_agent" label="客户端信息" />
                  <span v-else>—</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="panel-footnote">访问日志最多保留 7 天且上限为 5,000 条；响应大小取 HTTP Content-Length，未知时显示为 —。</p>
      </section>

      <section class="monitor-panel">
        <div class="panel-heading">
          <div>
            <h2>代理连通性测试</h2>
            <p>测试当前保存的 PAC 代理指令；每个代理有 12 秒总超时。不会把 PAC 中的 DIRECT 项当作代理节点。</p>
          </div>
          <button class="monitor-button primary" type="button" :disabled="probing" @click="runProxyTest">
            {{ probing ? "正在检测…" : "立即测试代理" }}
          </button>
        </div>

        <div class="probe-target">
          <span class="target-icon" aria-hidden="true">↗</span>
          <div>
            <strong>测试目标：example.com:443</strong>
            <p>通过代理建立目标连接、完成 TLS 握手并请求 HTTP 响应。测试从 genpac-runner 所在容器/主机网络发起。</p>
          </div>
        </div>

        <div v-if="probeError" class="monitor-alert is-error" role="alert">{{ probeError }}</div>

        <div v-if="latestProbe" class="probe-results">
          <div class="probe-run-head">
            <strong>本次检测结果</strong>
            <span>{{ latestProbe.results.length }} 个代理节点 · {{ formatDate(latestProbe.results[0]?.testedAt) }}</span>
          </div>
          <div v-for="(result, index) in latestProbe.results" :key="result.proxyLabel + index" class="probe-card">
            <div class="probe-card-top">
              <div class="probe-title">
                <span class="probe-state-dot" :class="result.success ? 'is-good' : 'is-bad'"></span>
                <strong>{{ result.proxyLabel }}</strong>
              </div>
              <span class="status-pill" :class="result.success ? 'good' : 'bad'">{{ result.success ? "可用" : "不可用" }}</span>
            </div>
            <div class="probe-metrics">
              <div><span>TCP 建连</span><strong>{{ formatDuration(result.tcpMs) }}</strong></div>
              <div><span>代理握手</span><strong>{{ formatDuration(result.handshakeMs) }}</strong></div>
              <div><span>目标访问</span><strong>{{ formatDuration(result.targetMs) }}</strong></div>
              <div><span>阶段</span><strong>{{ probePhaseLabel(result.phase) }}</strong></div>
            </div>
            <p v-if="result.httpStatus" class="probe-detail">目标 HTTP 状态码：{{ result.httpStatus }}</p>
            <p v-if="result.error" class="probe-error">{{ result.error }}</p>
            <p v-if="result.isLoopback" class="monitor-alert is-warning">
              该代理使用回环地址。此处测试的是 genpac-runner 运行环境内的回环地址，不是浏览器所在设备的 127.0.0.1。
            </p>
          </div>
          <p v-if="latestProbe.parseWarnings.length" class="probe-warning">
            未检测的配置项：{{ latestProbe.parseWarnings.join("；") }}
          </p>
          <p v-if="latestProbe.limited" class="probe-warning">本次最多检测 5 个代理节点，其余条目已跳过。</p>
          <p v-if="latestProbe.ignoredDirectEntries" class="panel-footnote">已忽略 {{ latestProbe.ignoredDirectEntries }} 个 DIRECT 项，因为直连不是代理服务器。</p>
        </div>

        <div v-else-if="!probing" class="monitor-empty">
          尚无本次检测结果。点击「立即测试代理」后，会对当前 PAC 代理项执行 TCP、代理协议和目标 HTTPS 请求测试。
        </div>
        <div v-if="probing" class="probe-progress">
          <span class="monitor-spinner"></span>
          <span>正在并行测试配置中的代理节点，请稍候…</span>
        </div>
      </section>

      <section class="monitor-panel">
        <div class="panel-heading">
          <div>
            <h2>代理检测历史</h2>
            <p>保存最近检测结果，便于比较可用性与延迟变化。</p>
          </div>
          <span class="panel-count">{{ probeHistory.length }} 条</span>
        </div>
        <div v-if="probeHistory.length === 0" class="monitor-empty">暂无代理检测历史。</div>
        <div v-else class="table-scroll">
          <table class="monitor-table">
            <thead>
              <tr>
                <th>检测时间</th>
                <th>代理节点</th>
                <th>结果</th>
                <th>TCP</th>
                <th>协议握手</th>
                <th>目标访问</th>
                <th>失败阶段/原因</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in probeHistory" :key="item.id">
                <td class="nowrap">{{ formatDate(item.tested_at) }}</td>
                <td><code>{{ item.proxy_label }}</code></td>
                <td><span class="status-pill" :class="item.success ? 'good' : 'bad'">{{ item.success ? "可用" : "失败" }}</span></td>
                <td class="nowrap">{{ formatDuration(item.tcp_ms) }}</td>
                <td class="nowrap">{{ formatDuration(item.handshake_ms) }}</td>
                <td class="nowrap">{{ formatDuration(item.target_ms) }}</td>
                <td class="probe-history-error">
                  <TextDetail
                    v-if="!item.success"
                    :text="probePhaseLabel(item.phase) + '：' + (item.error || '未提供错误详情')"
                    label="检测失败原因"
                  />
                  <span v-else>—</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="panel-footnote">检测历史最多保留 7 天且上限为 1,000 条。当前版本只做手动检测，不会自动探测或自动切换 PAC 配置。</p>
      </section>
    </template>

    <AppFooter />
    </div>
  </AdminLayout>
</template>

<style scoped>
.monitor-page { --monitor-gap: 18px; min-width: 0; }
.monitor-top-updated { display:inline-flex; align-items:center; gap:7px; color:var(--muted); font-size:10px; white-space:nowrap; }
.monitor-page-note { margin-bottom:14px; padding:10px 12px; border:1px solid var(--line); border-radius:9px; background:var(--surface); color:var(--muted); font-size:11px; line-height:1.55; }
.monitor-title-row { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; }
.monitor-title-row .page-intro { max-width: 48rem; }
.monitor-meta { display:flex; align-items:center; gap:8px; margin-top:14px; color:var(--muted); font-size:12px; }
.live-dot,.probe-state-dot { width:8px; height:8px; display:inline-block; border-radius:999px; background:var(--green); flex:0 0 auto; }
.live-dot.busy { background:var(--warn); }
.metric-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; margin:20px 0 var(--space-5); }
.metric-card { min-width:0; padding:17px 16px 15px; background:var(--surface); border:1px solid var(--line); border-radius:var(--radius); box-shadow:var(--shadow); display:flex; flex-direction:column; gap:5px; }
.metric-label { color:var(--muted); font-size:12px; font-weight:650; }
.metric-value { font-size:clamp(1.45rem,2.5vw,1.9rem); line-height:1.2; letter-spacing:-.04em; overflow-wrap:anywhere; }
.metric-value.value-warn { color:var(--warn); }
.metric-note { color:var(--muted); font-size:11px; line-height:1.45; }
.monitor-panel { background:var(--surface); border:1px solid var(--line); border-radius:var(--radius); padding:18px; margin-bottom:22px; box-shadow:var(--shadow); min-width:0; }
.panel-heading { display:flex; align-items:flex-start; justify-content:space-between; gap:14px; margin-bottom:16px; }
.trend-legend { display:flex; flex-wrap:wrap; align-items:center; gap:14px; padding-top:14px; font-size:11px; color:var(--muted); }
.trend-legend > span { display:inline-flex; align-items:center; gap:6px; }
.legend-swatch { display:inline-block; width:9px; height:9px; border-radius:3px; }
.request-swatch { background:var(--accent); }
.error-swatch { background:var(--red); }
.trend-sample-note { margin-left:auto; }

.panel-heading h2 { margin:0; font-size:16px; letter-spacing:-.02em; }
.panel-heading p { margin:5px 0 0; color:var(--muted); font-size:12px; line-height:1.6; }
.panel-actions { display:flex; align-items:center; gap:8px; flex:0 0 auto; }
.panel-count { flex:0 0 auto; padding:4px 9px; border:1px solid var(--line); border-radius:999px; font-size:11px; color:var(--muted); background:var(--surface-2); }
.monitor-button { display:inline-flex; align-items:center; justify-content:center; min-height:38px; padding:0 14px; border:1px solid var(--line); border-radius:9px; font-size:12px; font-weight:700; cursor:pointer; white-space:nowrap; transition:filter .15s, opacity .15s; }
.monitor-button:disabled { opacity:.55; cursor:wait; }
.monitor-button.primary { background:var(--accent); border-color:var(--accent); color:var(--accent-contrast); }
.monitor-button.secondary { color:var(--text); background:var(--surface); }
.monitor-button:hover:not(:disabled) { filter:brightness(1.05); }
.monitor-notice,.probe-target { padding:12px 14px; border-radius:10px; background:var(--surface-2); border:1px solid var(--line); font-size:12px; color:var(--muted); line-height:1.65; margin-bottom:14px; }
.monitor-notice strong { color:var(--text); }
.table-scroll { width:100%; overflow:auto; border:1px solid var(--line); border-radius:10px; }
.monitor-table { width:100%; border-collapse:collapse; font-size:12px; min-width:850px; }
.monitor-table th { padding:11px 12px; color:var(--muted); background:var(--surface-2); text-align:left; font-weight:700; white-space:nowrap; border-bottom:1px solid var(--line); }
.monitor-table td { padding:11px 12px; border-bottom:1px solid var(--line); vertical-align:middle; }
.monitor-table tbody tr:last-child td { border-bottom:0; }
.monitor-table tbody tr:hover { background:color-mix(in srgb,var(--accent) 4%,transparent); }
.monitor-table code { max-width:330px; display:inline-block; overflow-wrap:anywhere; white-space:normal; }
.nowrap { white-space:nowrap; }
.path-cell { min-width:180px; max-width:300px; }
.ua-cell { max-width:220px; min-width:160px; color:var(--muted); }
.path-cell code { word-break:break-all; }
.method-label { display:inline-block; color:var(--muted); font-size:10px; font-weight:750; margin-right:6px; }
.category-pill,.status-pill { display:inline-flex; align-items:center; border-radius:999px; padding:3px 7px; font-size:10px; font-weight:700; white-space:nowrap; border:1px solid var(--line); background:var(--surface-2); color:var(--muted); }
.status-pill.good { color:var(--green); background:var(--green-soft); border-color:color-mix(in srgb,var(--green) 25%,var(--line)); }
.status-pill.bad { color:var(--red); background:var(--red-soft); border-color:color-mix(in srgb,var(--red) 25%,var(--line)); }
.status-pill.warn { color:var(--warn); background:var(--warn-soft); border-color:color-mix(in srgb,var(--warn) 25%,var(--line)); }
.panel-footnote { color:var(--muted); font-size:11px; margin:12px 0 0; line-height:1.6; }
.monitor-empty { padding:26px 12px; color:var(--muted); font-size:13px; text-align:center; border:1px dashed var(--line); border-radius:10px; }
.probe-target { display:flex; gap:12px; align-items:flex-start; margin:0 0 16px; }
.target-icon { width:30px; height:30px; display:grid; place-items:center; border-radius:8px; background:var(--accent-soft); color:var(--accent); font-size:18px; flex:0 0 auto; }
.probe-target strong { color:var(--text); font-size:13px; }
.probe-target p { margin:3px 0 0; }
.probe-results { display:flex; flex-direction:column; gap:12px; }
.probe-run-head { display:flex; align-items:center; justify-content:space-between; gap:10px; font-size:12px; }
.probe-run-head span { color:var(--muted); }
.probe-card { border:1px solid var(--line); border-radius:12px; padding:14px; min-width:0; }
.probe-card-top,.probe-title { display:flex; align-items:center; gap:9px; }
.probe-card-top { justify-content:space-between; }
.probe-title { min-width:0; overflow-wrap:anywhere; }
.probe-state-dot.is-good { background:var(--green); }
.probe-state-dot.is-bad { background:var(--red); }
.probe-metrics { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; margin-top:14px; }
.probe-metrics div { display:flex; flex-direction:column; gap:4px; min-width:0; padding:10px; border-radius:8px; background:var(--surface-2); }
.probe-metrics span { color:var(--muted); font-size:11px; }
.probe-metrics strong { font-size:13px; overflow-wrap:anywhere; }
.probe-detail,.probe-error,.probe-warning { font-size:12px; margin:10px 0 0; line-height:1.65; overflow-wrap:anywhere; }
.probe-error { color:var(--red); }
.probe-warning { color:var(--warn); }
.monitor-alert { padding:10px 12px; border-radius:9px; font-size:12px; line-height:1.65; margin:10px 0; overflow-wrap:anywhere; }
.monitor-alert.is-error { border:1px solid color-mix(in srgb,var(--red) 25%,var(--line)); background:var(--red-soft); color:var(--red); }
.monitor-alert.is-warning { border:1px solid color-mix(in srgb,var(--warn) 25%,var(--line)); background:var(--warn-soft); color:var(--warn); }
.probe-progress { display:flex; align-items:center; gap:10px; margin-top:14px; color:var(--muted); font-size:12px; }
.monitor-state { display:flex; align-items:center; gap:14px; padding:18px; margin-bottom:18px; border:1px solid var(--line); border-radius:12px; background:var(--surface); color:var(--muted); }
.monitor-state strong { color:var(--text); }
.monitor-state p { margin:3px 0 0; font-size:12px; }
.monitor-state.is-error { justify-content:space-between; color:var(--red); border-color:color-mix(in srgb,var(--red) 25%,var(--line)); }
.monitor-spinner { width:20px; height:20px; border:2px solid var(--line); border-top-color:var(--accent); border-radius:50%; animation:monitor-spin .8s linear infinite; flex:0 0 auto; }
@keyframes monitor-spin { to { transform:rotate(360deg); } }
.probe-history-error { min-width:220px; max-width:340px; overflow-wrap:anywhere; color:var(--red); }
@media(max-width:1100px) { .metric-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } .monitor-panel { padding:16px; } .probe-metrics { grid-template-columns:repeat(2,minmax(0,1fr)); } }
@media(max-width:560px) { .monitor-title-row { flex-direction:column; } .monitor-title-row .monitor-button { align-self:flex-start; } .panel-heading { flex-direction:column; align-items:stretch; gap:8px; margin-bottom:12px; } .panel-actions { align-self:flex-start; } .panel-heading > .monitor-button { align-self:flex-start; } .metric-grid { grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; margin:14px 0 20px; } .metric-card { padding:12px 11px; border-radius:11px; } .metric-label { font-size:10px; } .metric-value { font-size:1.32rem; } .monitor-panel { padding:13px; margin-bottom:16px; } .trend-sample-note { margin-left:0; flex-basis:100%; } .probe-run-head { flex-direction:column; align-items:flex-start; } .probe-metrics { gap:7px; } }
</style>
