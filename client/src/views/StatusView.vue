<script setup lang="ts">
import { onMounted, ref, computed, watch } from "vue";
import { api, type Meta, type PacStatus } from "../api/client";
import AppHeader from "../components/AppHeader.vue";
import AppFooter from "../components/AppFooter.vue";
import RuleVirtualList from "../components/RuleVirtualList.vue";
import AppIcon from "../components/AppIcon.vue";

const status = ref<PacStatus | null>(null);
const meta = ref<Meta | null>(null);
const error = ref("");
const loading = ref(true);
const adminEntry = ref<"/admin/dashboard" | "/admin/settings" | "/admin/login">("/admin/dashboard");

async function loadStatus() {
  loading.value = true;
  error.value = "";
  try {
    const [currentStatus, currentMeta, currentSession] = await Promise.all([
      api.status(),
      api.meta(),
      api.session().catch(() => null),
    ]);
    status.value = currentStatus;
    meta.value = currentMeta;
    // 只有成功确认会话状态后才决定入口；未登录时直接进入登录页。
    if (currentSession && !currentSession.loggedIn) adminEntry.value = "/admin/login";
    else if (currentSession?.mustChangePassword) adminEntry.value = "/admin/settings";
    else if (currentSession?.loggedIn) adminEntry.value = "/admin/dashboard";
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}
onMounted(() => { void loadStatus(); });

const hasRuleSummary = computed(() =>
  status.value?.mode === "custom" || status.value?.mode === "remote"
);

const domainInput = ref("");
const checkedDomain = ref("");
const activeRuleType = ref<"direct" | "block">("direct");

interface RuleEntry {
  domain: string;
  source: string;
}
interface DomainRouteResult {
  kind: "direct" | "proxy" | "blocked" | "unknown" | "invalid";
  host: string;
  title: string;
  detail: string;
  matchedRule: string | null;
  source: string | null;
}

const directEntries = computed<RuleEntry[]>(() => {
  const current = status.value;
  if (!current) return [];
  const entries = new Map<string, RuleEntry>();
  for (const domain of current.remoteDirectList) {
    entries.set(domain.toLowerCase(), { domain, source: "远程例外直连" });
  }
  for (const domain of current.directList) {
    entries.set(domain.toLowerCase(), { domain, source: "自定义直连" });
  }
  return [...entries.values()];
});

const blockEntries = computed<RuleEntry[]>(() =>
  (status.value?.blockList ?? []).map((domain) => ({ domain, source: "自定义黑名单" }))
);

watch(domainInput, () => {
  checkedDomain.value = "";
});

function checkDomain() {
  checkedDomain.value = domainInput.value.trim();
}

function isPrivateOrLoopbackIpv4(host: string): boolean {
  const parts = host.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return false;
  const octets = parts.map(Number);
  if (octets.some((part) => part < 0 || part > 255)) return false;
  const [a, b] = octets;
  return a === 127 || a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168);
}

function matchesCustomRule(host: string, rule: string): boolean {
  const pattern = rule.trim().toLowerCase();
  if (!pattern) return false;
  if (pattern.includes("*")) {
    let source = "^";
    for (const char of pattern) {
      if (char === "*") source += ".*";
      else if (".+?^$(){}|[]\\".includes(char)) source += "\\" + char;
      else source += char;
    }
    return new RegExp(source + "$").test(host);
  }
  return host === pattern || host.endsWith("." + pattern);
}

function matchesRemoteDomain(host: string, rule: string): boolean {
  const domain = rule.toLowerCase().trim();
  return Boolean(domain) && (host === domain || host.endsWith("." + domain));
}

const domainRoute = computed<DomainRouteResult | null>(() => {
  const raw = checkedDomain.value;
  if (!raw) return null;

  let host: string;
  try {
    const address = /^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : "http://" + raw;
    host = new URL(address).hostname.toLowerCase().replace(/\.$/, "");
    if (!host || host.includes("*") || /\s/.test(host)) throw new Error("invalid host");
  } catch {
    return {
      kind: "invalid", host: raw, title: "域名格式不正确",
      detail: "请输入域名或完整 URL，例如 example.com 或 https://example.com/path。",
      matchedRule: null, source: null,
    };
  }

  const current = status.value;
  if (!current || (current.mode !== "custom" && current.mode !== "remote")) {
    return {
      kind: "unknown", host, title: "暂时无法判断",
      detail: current?.notice || "当前 PAC 状态不可用，请先生成并刷新 PAC。",
      matchedRule: null, source: null,
    };
  }

  if (host === "localhost" || !host.includes(".") || isPrivateOrLoopbackIpv4(host)) {
    return {
      kind: "direct", host, title: "直连",
      detail: "命中 PAC 的 localhost、无点号主机名或 IPv4 回环 / RFC 1918 私网地址直连规则。",
      matchedRule: null, source: "本地 / 内网规则",
    };
  }

  const blocked = current.blockList.find((rule) => matchesCustomRule(host, rule));
  if (blocked) {
    return {
      kind: "blocked", host, title: "黑名单拦截",
      detail: "命中自定义黑名单；按照 PAC 的规则顺序，该结果优先于直连和远程列表。",
      matchedRule: blocked, source: "自定义黑名单",
    };
  }

  const customDirect = current.directList.find((rule) => matchesCustomRule(host, rule));
  if (customDirect) {
    return {
      kind: "direct", host, title: "直连",
      detail: "命中自定义直连规则，优先于远程列表。",
      matchedRule: customDirect, source: "自定义直连",
    };
  }

  if (current.mode === "remote") {
    const remoteDirect = current.remoteDirectList.find((rule) => matchesRemoteDomain(host, rule));
    if (remoteDirect) {
      return {
        kind: "direct", host, title: "直连",
        detail: "命中远程列表的例外直连域名。",
        matchedRule: remoteDirect, source: "远程例外",
      };
    }

    const remoteProxy = current.remoteProxyList.find((rule) => matchesRemoteDomain(host, rule));
    if (remoteProxy) {
      return {
        kind: "proxy", host, title: "走代理",
        detail: "命中远程代理域名列表。",
        matchedRule: remoteProxy, source: "远程代理列表",
      };
    }

    return {
      kind: "direct", host, title: "直连",
      detail: "未命中自定义规则或远程代理列表；远程模式下其余域名默认直连。",
      matchedRule: null, source: "远程模式默认规则",
    };
  }

  return {
    kind: "proxy", host, title: "走代理",
    detail: "未命中黑名单或直连规则，将使用当前默认代理：" + (current.pacProxy || "未识别") + "。",
    matchedRule: null, source: current.pacProxy || "默认代理未识别",
  };
});

</script>

<template>
  <main class="page status-page">
    <AppHeader brand="genpac-runner" sub="公共状态页">
      <RouterLink v-if="meta?.adminEnabled" class="primary"  :to="adminEntry">后台管理</RouterLink>
    </AppHeader>

    <section class="page-hero">
      <div class="page-kicker">运行状态</div>
      <h1 class="page-title">PAC 规则概览</h1>
      <p class="page-intro">这里会读取当前生成的 <code>proxy.pac</code> 文件并展示可识别的规则摘要。域名路由判断根据已解析的规则摘要进行估算，供排查参考；它不会执行 PAC 脚本，也不等同于代理客户端的完整实际结果。</p>
      <div v-if="status" class="hero-meta">
        <span class="status-indicator" :class="status.hasPac ? 'online' : 'idle'"></span>
        <strong>{{ status.modeLabel }}</strong><span class="meta-divider">·</span>
        <span>{{ status.hasPac ? `生成时间：${status.updatedAt}` : "尚无生成文件" }}</span>
      </div>
    </section>

    <section v-if="status?.hasPac" class="pac-access-card" aria-label="PAC 文件操作">
      <div class="pac-access-copy">
        <span class="pac-access-kicker"><AppIcon name="file-check-2" :size="14" /> 当前 PAC 文件</span>
        <h2>获取 PAC 文件</h2>
        <p>查看当前生成的代理规则文件，或下载到设备中使用。</p>
        <span class="pac-access-updated">最后生成：{{ status.updatedAt }}</span>
      </div>
      <div class="pac-access-actions">
        <a class="pac-access-link primary" href="/proxy.pac" target="_blank" rel="noopener noreferrer">
          <AppIcon name="external-link" :size="17" />查看 PAC
        </a>
        <a class="pac-access-link secondary" href="/proxy.pac?download=1">
          <AppIcon name="download" :size="17" />下载 PAC
        </a>
        <button class="pac-access-refresh" type="button" :class="{ 'is-loading': loading }" @click="loadStatus" :disabled="loading">
          <AppIcon :name="loading ? 'loader-circle' : 'refresh-cw'" :class="{ 'icon-spinning': loading }" :size="15" />
          {{ loading ? "刷新中…" : "刷新状态" }}
        </button>
      </div>
    </section>

    <section v-if="loading" class="state-card" aria-live="polite">
      <span class="spinner" aria-hidden="true"></span>
      <div><strong>正在读取运行状态</strong><p>正在检查当前 PAC 文件和生成模式。</p></div>
    </section>

    <section v-else-if="error" class="state-card error-card" role="alert">
      <div class="state-icon"><AppIcon name="circle-alert" :size="18" /></div>
      <div class="state-copy"><strong>无法读取状态</strong><p>{{ error }}</p><button class="action-button" type="button" @click="loadStatus">重新加载</button></div>
    </section>

    <template v-else-if="status">
      <section v-if="status.mode === 'empty'" class="empty-hero">
        <div class="empty-icon" aria-hidden="true"><AppIcon name="file-cog" :size="26" :stroke-width="1.7" /></div>
        <h2>还没有生成 PAC</h2>
        <p>先进入后台管理，在配置页面设置启动模式和规则，然后点击「保存并生成 PAC」。生成后，这里会显示可识别的规则摘要。</p>
        <RouterLink class="action-button primary"  :to="adminEntry">进入后台管理</RouterLink>
      </section>

      <template v-else-if="hasRuleSummary">
        <section class="stats-grid" :class="status.mode === 'remote' ? 'remote-stats' : 'custom-stats'">
          <article v-if="status.mode === 'remote'" class="stat-card">
            <span class="stat-label">远程代理域名</span><strong class="stat-number">{{ status.remoteProxyCount }}</strong><span class="stat-caption">命中时走代理</span>
          </article>
          <article v-if="status.mode === 'remote'" class="stat-card">
            <span class="stat-label">远程例外直连</span><strong class="stat-number">{{ status.remoteDirectCount }}</strong><span class="stat-caption">远程列表中的例外规则</span>
          </article>
          <article class="stat-card">
            <span class="stat-label">自定义直连</span><strong class="stat-number">{{ status.directList.length }}</strong><span class="stat-caption">这些域名跳过代理</span>
          </article>
          <article class="stat-card">
            <span class="stat-label">自定义黑名单</span><strong class="stat-number">{{ status.blockList.length }}</strong><span class="stat-caption">命中时拦截请求</span>
          </article>
          <article v-if="status.mode === 'custom'" class="stat-card stat-card-wide stat-proxy-card">
            <div class="proxy-card-heading">
              <span class="stat-label">默认代理</span>
              <span class="proxy-card-badge"><AppIcon name="route" :size="13" />默认出口</span>
            </div>
            <strong class="stat-proxy">{{ status.pacProxy || "未识别" }}</strong>
            <span class="stat-caption">未命中自定义规则时，流量将通过此代理转发</span>
          </article>
        </section>

        <section class="domain-check section-card">
          <div class="domain-check-head">
            <div>
              <h2>域名路由判断</h2>
              <p>输入域名或 URL，按当前 PAC 中可识别的规则摘要估算路由结果。</p>
            </div>
          </div>
          <form class="domain-check-form" @submit.prevent="checkDomain">
            <input
              v-model="domainInput"
              type="text"
              inputmode="url"
              autocomplete="off"
              spellcheck="false"
              aria-label="需要判断的域名"
              placeholder="例如 example.com 或 https://example.com/path"
            />
            <button type="submit" class="action-button primary" :disabled="!domainInput.trim()">判断路由</button>
          </form>
          <p class="domain-check-note">此工具仅根据 PAC 中可识别的规则摘要进行估算，不查询 DNS，也不会执行 PAC 脚本。部分复杂规则或代理客户端行为可能无法完整反映；localhost、无点号主机名及 IPv4 回环 / RFC 1918 私网地址按本项目的直连规则处理。</p>
          <div v-if="domainRoute" class="domain-check-result" :class="'result-' + domainRoute.kind" role="status" aria-live="polite">
            <span class="result-mark" aria-hidden="true">
              <AppIcon :name="domainRoute.kind === 'direct' ? 'circle-check' : domainRoute.kind === 'proxy' ? 'route' : domainRoute.kind === 'blocked' ? 'circle-x' : 'circle-alert'" :size="17" />
            </span>
            <div class="result-copy">
              <div class="result-title-row">
                <strong>{{ domainRoute.title }}</strong>
                <code>{{ domainRoute.host }}</code>
              </div>
              <p>{{ domainRoute.detail }}</p>
              <p v-if="domainRoute.matchedRule" class="matched-rule">
                <span>匹配规则</span><code>{{ domainRoute.matchedRule }}</code><span>· {{ domainRoute.source }}</span>
              </p>
              <p v-else-if="domainRoute.source" class="matched-rule"><span>{{ domainRoute.source }}</span></p>
            </div>
          </div>
        </section>

        <section class="rules-section section-card">
          <div class="section-head rules-section-head">
            <div>
              <h2>域名路由明细</h2>
              <p class="section-description">展示自定义直连与黑名单规则；默认代理信息已在上方单独展示。长域名可点击查看完整内容，列表较长时可在固定区域内滚动。</p>
            </div>
            <RouterLink v-if="meta?.adminEnabled" to="/admin/settings" class="text-link">编辑规则 <AppIcon name="arrow-right" :size="14" /></RouterLink>
          </div>

          <div class="rule-tabs" role="tablist" aria-label="域名规则类型">
            <button type="button" role="tab" :aria-selected="activeRuleType === 'direct'"
              :class="{ active: activeRuleType === 'direct' }" @click="activeRuleType = 'direct'">
              <span class="rule-dot direct-dot"></span><span>直连</span><strong>{{ directEntries.length }}</strong>
            </button>

            <button type="button" role="tab" :aria-selected="activeRuleType === 'block'"
              :class="{ active: activeRuleType === 'block' }" @click="activeRuleType = 'block'">
              <span class="rule-dot block-dot"></span><span>黑名单</span><strong>{{ blockEntries.length }}</strong>
            </button>
          </div>

          <div class="rule-content" role="tabpanel">
            <template v-if="activeRuleType === 'direct'">
              <p class="rule-description">自定义直连优先于远程列表；蓝色来源标签代表远程规则中的例外直连。</p>
              <RuleVirtualList :items="directEntries" empty-text="没有额外的直连规则。" :height="300" />
            </template>
            <template v-else>
              <p class="rule-description">红色来源标签代表自定义黑名单；localhost、无点号主机名及 IPv4 回环 / RFC 1918 私网直连规则优先。</p>
              <RuleVirtualList :items="blockEntries" empty-text="没有配置黑名单。" :height="300" />
            </template>
          </div>
        </section>
      </template>

      <section v-else class="state-card warning-card">
        <div class="state-icon"><AppIcon name="info" :size="18" /></div><div class="state-copy"><strong>{{ status.modeLabel }}</strong><p>{{ status.notice }}</p></div>
      </section>

    </template>
    <AppFooter />
  </main>
</template>

<style scoped>
.status-page {
  width: min(1080px, calc(100% - var(--page-pad) * 2));
  margin: 0 auto;
  padding-bottom: 56px;
}
.page-hero {
  position: relative;
  overflow: hidden;
  margin-bottom: 22px;
  padding: clamp(22px, 3.8vw, 34px) clamp(22px, 4vw, 38px);
  border: 1px solid color-mix(in srgb, var(--accent) 15%, var(--line));
  border-radius: 18px;
  background: linear-gradient(128deg,
    color-mix(in srgb, var(--accent) 7%, var(--surface)) 0%,
    var(--surface) 72%);
  box-shadow: var(--shadow);
}
.page-hero::before {
  position: absolute;
  inset: 18px auto 18px 0;
  width: 3px;
  border-radius: 0 6px 6px 0;
  background: var(--accent);
  content: "";
}
.status-page .page-kicker {
  display: inline-flex;
  align-items: center;
  min-height: 25px;
  padding: 4px 9px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 10px;
  letter-spacing: .12em;
}
.status-page .page-title {
  margin: 12px 0 10px;
  font-size: clamp(1.8rem, 4vw, 2.35rem);
  line-height: 1.18;
  letter-spacing: -.045em;
}
.status-page .page-intro {
  max-width: 760px;
  font-size: 13px;
  line-height: 1.75;
}
.hero-meta {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 9px;
  margin-top: 20px;
  padding: 8px 12px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: color-mix(in srgb, var(--surface) 88%, transparent);
  color: var(--muted);
  font-size: 11px;
}

.hero-meta strong { color:var(--text); font-weight:650; }
.meta-divider { opacity:.6; }
.status-indicator { display:inline-block; width:8px; height:8px; border-radius:50%; background:var(--muted); }
.status-indicator.online { background:var(--green); box-shadow:0 0 0 3px var(--green-soft); }
.status-indicator.idle { background:var(--warn); }
.stats-grid { display:grid; gap:14px; margin-bottom:22px; }
.remote-stats { grid-template-columns:repeat(4,minmax(0,1fr)); }
.custom-stats { grid-template-columns:repeat(2,minmax(0,1fr)); }
.stat-card { position:relative; min-width:0; min-height:120px; padding:19px 20px; border:1px solid var(--line); border-radius:15px; background:var(--surface); box-shadow:var(--shadow); transition:border-color .18s,transform .18s; }
.stat-card:hover { border-color:color-mix(in srgb,var(--accent) 30%,var(--line)); transform:translateY(-1px); }
.stat-card-wide { grid-column:1 / -1; }
.stat-label { display:block; color:var(--muted); font-size:11px; font-weight:700; letter-spacing:.02em; margin-bottom:11px; }
.stat-number { display:block; font-size:clamp(25px,3vw,32px); line-height:1.1; letter-spacing:-.04em; font-variant-numeric:tabular-nums; }
.stat-caption { display:block; color:var(--muted); font-size:11px; line-height:1.55; margin-top:9px; }
.stat-proxy { display:block; overflow-wrap:anywhere; color:var(--accent); font:700 clamp(13px,1.7vw,16px)/1.55 var(--font-mono); }
.stat-proxy-card {
  border-color:color-mix(in srgb,var(--accent) 30%,var(--line));
  background:linear-gradient(112deg,color-mix(in srgb,var(--accent) 9%,var(--surface)),var(--surface) 78%);
}
.proxy-card-heading { display:flex; align-items:center; justify-content:space-between; gap:12px; }
.proxy-card-heading .stat-label { margin-bottom:13px; }
.proxy-card-badge { display:inline-flex; align-items:center; gap:5px; flex:0 0 auto; padding:5px 8px; border:1px solid color-mix(in srgb,var(--accent) 22%,var(--line)); border-radius:999px; background:var(--accent-soft); color:var(--accent); font-size:10px; font-weight:750; }
.section-card,.empty-hero { border:1px solid var(--line); border-radius:var(--radius); background:var(--surface); box-shadow:var(--shadow); }
.section-card { padding:clamp(17px,2.8vw,26px); margin-bottom:20px; }
.section-head { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; margin-bottom:18px; }
.section-head h2 { margin:0; font-size:18px; letter-spacing:-.025em; }
.rules-section { margin-top:0; }
.rules-section-head { align-items:end; margin-bottom:16px; }
.section-description { margin:7px 0 0; color:var(--muted); font-size:12px; }
.text-link { display:inline-flex; align-items:center; gap:5px; color:var(--accent); font-size:12px; font-weight:650; white-space:nowrap; }
.domain-check { margin-bottom:22px; }
.domain-check-head h2 { margin:0; font-size:18px; letter-spacing:-.02em; }
.domain-check-head p { margin:7px 0 0; color:var(--muted); font-size:12px; }
.domain-check-form { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:10px; margin-top:16px; }
.domain-check-form input {
  box-sizing:border-box; width:100%; min-width:0; min-height:40px; border:1px solid var(--line);
  border-radius:8px; padding:9px 12px; color:var(--text); background:var(--bg); font:inherit; font-size:13px;
}
.domain-check-form input:focus { outline:none; border-color:var(--accent); box-shadow:0 0 0 3px var(--accent-soft); }
.domain-check-form button { white-space:nowrap; }
.domain-check-note { margin:8px 0 0; color:var(--muted); font-size:11px; line-height:1.5; }
.domain-check-result {
  display:flex; align-items:flex-start; gap:12px; margin-top:16px; padding:13px 14px;
  border:1px solid var(--line); border-radius:9px; background:var(--surface-2);
}
.result-mark { display:grid; place-items:center; flex:0 0 auto; width:30px; height:30px; border-radius:8px; font-size:16px; font-weight:800; }
.result-direct .result-mark { color:var(--green); background:var(--green-soft); }
.result-proxy .result-mark { color:var(--accent); background:var(--accent-soft); }
.result-blocked .result-mark { color:var(--red); background:var(--red-soft); }
.result-unknown .result-mark,.result-invalid .result-mark { color:var(--warn); background:var(--warn-soft); }
.result-copy { flex:1; min-width:0; }
.result-title-row { display:flex; align-items:baseline; flex-wrap:wrap; gap:9px; }
.result-title-row strong { font-size:14px; }
.result-title-row code { color:var(--muted); font-size:12px; overflow-wrap:anywhere; }
.result-copy > p { margin:6px 0 0; color:var(--muted); font-size:12px; line-height:1.5; }
.result-copy .matched-rule { display:flex; align-items:baseline; flex-wrap:wrap; gap:7px; margin-top:9px; }
.matched-rule code { padding:3px 6px; border-radius:5px; background:var(--bg); color:var(--text); font-size:11px; overflow-wrap:anywhere; }
.rule-tabs {
  display:grid;
  grid-template-columns:repeat(2,minmax(0,1fr));
  gap:6px;
  margin-bottom:14px;
  padding:5px;
  border:1px solid var(--line);
  border-radius:10px;
  background:var(--surface-2);
}
.rule-tabs button {
  display:flex;
  align-items:center;
  justify-content:center;
  gap:7px;
  min-width:0;
  min-height:40px;
  padding:0 10px;
  border:1px solid transparent;
  border-radius:7px;
  background:transparent;
  color:var(--muted);
  font:inherit;
  font-size:12px;
  font-weight:600;
  cursor:pointer;
  transition:background .15s,border-color .15s,color .15s,box-shadow .15s;
}
.rule-tabs button:hover {
  background:var(--surface);
  color:var(--text);
}
.rule-tabs button:active {
  background:var(--accent-soft);
  border-color:var(--accent);
  color:var(--accent);
}
.rule-tabs button:focus-visible {
  outline:2px solid var(--accent);
  outline-offset:2px;
}
.rule-tabs button.active {
  color:var(--text);
  border-color:color-mix(in srgb,var(--accent) 38%,var(--line));
  background:var(--surface);
  box-shadow:0 1px 2px rgba(26,35,50,.06);
}
.rule-tabs button strong {
  display:inline-flex;
  align-items:center;
  justify-content:center;
  flex:0 0 auto;
  min-width:24px;
  min-height:22px;
  margin-left:1px;
  padding:0 6px;
  border-radius:999px;
  background:var(--bg);
  color:var(--muted);
  font-size:11px;
  line-height:1;
  font-weight:700;
  font-variant-numeric:tabular-nums;
}
.rule-tabs button.active strong {
  background:var(--accent-soft);
  color:var(--accent);
}
.rule-dot { width:8px; height:8px; flex:0 0 auto; border-radius:50%; }
.direct-dot { background:var(--green); }
.proxy-dot { background:var(--accent); }
.block-dot { background:var(--red); }
.rule-content { min-width:0; }
.rule-description { margin:0 0 10px; color:var(--muted); font-size:12px; line-height:1.55; }
.default-proxy {
  display:flex; flex-direction:column; align-items:flex-start; gap:8px; padding:16px;
  border:1px solid color-mix(in srgb,var(--accent) 26%,var(--line)); border-radius:10px;
  background:linear-gradient(112deg,color-mix(in srgb,var(--accent) 7%,var(--surface)),var(--surface) 82%);
}
.default-proxy span { color:var(--muted); font-size:11px; font-weight:650; }
.default-proxy code { max-width:100%; overflow-wrap:anywhere; padding:7px 9px; border:1px solid color-mix(in srgb,var(--accent) 18%,var(--line)); border-radius:7px; background:var(--accent-soft); color:var(--accent); font:700 13px/1.5 var(--font-mono); }
.default-proxy p { margin:0; color:var(--muted); font-size:12px; line-height:1.5; }
.pac-access-card {
  display:flex; align-items:center; justify-content:space-between; gap:24px;
  margin:0 0 22px; padding:clamp(20px,3vw,28px);
  border:1px solid color-mix(in srgb,var(--accent) 24%,var(--line));
  border-radius:17px;
  background:linear-gradient(115deg,color-mix(in srgb,var(--accent) 8%,var(--surface)),var(--surface) 74%);
  box-shadow:var(--shadow);
}
.pac-access-copy { min-width:0; }
.pac-access-kicker { display:inline-flex; align-items:center; gap:6px; color:var(--accent); font-size:11px; font-weight:750; }
.pac-access-copy h2 { margin:10px 0 6px; color:var(--text); font-size:clamp(1.15rem,2.6vw,1.45rem); letter-spacing:-.025em; }
.pac-access-copy p { margin:0; color:var(--muted); font-size:12px; line-height:1.6; }
.pac-access-updated { display:block; margin-top:12px; color:var(--muted); font-size:11px; font-variant-numeric:tabular-nums; }
.pac-access-actions { display:flex; flex-wrap:wrap; align-items:center; justify-content:flex-end; gap:8px; flex-shrink:0; }
.pac-access-link,.pac-access-refresh { display:inline-flex; align-items:center; justify-content:center; gap:8px; min-height:44px; padding:0 16px; border:1px solid var(--line); border-radius:10px; font:inherit; font-size:12px; font-weight:750; text-decoration:none; white-space:nowrap; cursor:pointer; transition:background .15s,border-color .15s,transform .15s; }
.pac-access-link.primary { border-color:var(--accent); background:var(--accent); color:var(--on-accent,#fff); box-shadow:0 4px 12px color-mix(in srgb,var(--accent) 18%,transparent); }
.pac-access-link.primary:hover { filter:brightness(1.04); transform:translateY(-1px); text-decoration:none; }
.pac-access-link.secondary { background:var(--surface); color:var(--text); }
.pac-access-link.secondary:hover,.pac-access-refresh:hover:not(:disabled) { border-color:color-mix(in srgb,var(--accent) 45%,var(--line)); background:var(--surface-2); text-decoration:none; }
.pac-access-refresh { background:transparent; color:var(--accent); }
.pac-access-refresh:disabled { color:var(--control-disabled-text); background:var(--control-disabled-bg); border-color:var(--control-disabled-border); cursor:not-allowed; }
.pac-access-refresh.is-loading:disabled { color:var(--text); background:var(--surface); border-color:var(--line); cursor:progress; }
.pac-access-link:focus-visible,.pac-access-refresh:focus-visible { outline:2px solid var(--accent); outline-offset:3px; }

.state-card { display:flex; align-items:flex-start; gap:14px; padding:18px; border:1px solid var(--line); border-radius:var(--radius); background:var(--surface); }
.state-card strong { font-size:14px; }
.state-card p { margin:5px 0 12px; color:var(--muted); font-size:13px; }
.error-card,.warning-card { border-color:color-mix(in srgb,var(--warn) 38%,var(--line)); }
.state-icon,.empty-icon { display:grid; place-items:center; flex:0 0 auto; width:36px; height:36px; border-radius:10px; background:var(--surface-2); color:var(--muted); font-weight:700; }
.empty-hero { padding:clamp(24px,6vw,42px); text-align:center; }
.empty-icon { width:48px; height:48px; margin:0 auto 14px; color:var(--accent); font-size:24px; }
.empty-hero h2 { margin:0; font-size:19px; }
.empty-hero p { max-width:36em; margin:10px auto 18px; color:var(--muted); font-size:13px; }
.action-button { display:inline-flex; align-items:center; justify-content:center; min-height:38px; padding:0 14px; border:1px solid var(--line); border-radius:9px; background:var(--surface); color:var(--text); font-size:12px; font-weight:650; text-decoration:none; cursor:pointer; }
.action-button.primary { color:var(--accent-contrast); background:var(--accent); border-color:var(--accent); }
.action-button:not(.primary):hover:not(:disabled) { background:var(--surface-2); border-color:color-mix(in srgb,var(--accent) 32%,var(--line)); color:var(--text); }
.action-button.primary:hover:not(:disabled) { background:var(--accent-hover); border-color:var(--accent-hover); color:var(--accent-contrast); }
.action-button.primary:active:not(:disabled) { background:var(--accent-active); border-color:var(--accent-active); color:var(--accent-contrast); }
.action-button:not(.primary):active:not(:disabled) { background:var(--accent-soft); border-color:var(--accent); color:var(--accent); }
.action-button:disabled {
  opacity:1;
  color:var(--control-disabled-text);
  background:var(--control-disabled-bg);
  border-color:var(--control-disabled-border);
  cursor:not-allowed;
}
.spinner { width:18px; height:18px; border:2px solid var(--line); border-top-color:var(--accent); border-radius:50%; animation:spin .8s linear infinite; flex:0 0 auto; }
.state-copy { min-width:0; }
.icon-spinning { animation: status-icon-spin .9s linear infinite; }
@keyframes status-icon-spin { to { transform:rotate(360deg); } }
@keyframes spin { to { transform:rotate(360deg); } }
@media(max-width:960px) { .remote-stats,.custom-stats { grid-template-columns:repeat(2,minmax(0,1fr)); } }
@media(max-width:480px) {
  .remote-stats,.custom-stats { grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }
  .page-hero { padding:22px 18px 22px 22px; border-radius:15px; }
  .status-page .page-title { font-size:clamp(1.65rem,7vw,2rem); }
  .status-page .page-intro { font-size:12px; }
  .hero-meta { align-items:flex-start; gap:7px; border-radius:10px; }
  .stats-grid { gap:8px; }
  .stat-card { min-height:108px; padding:13px 12px; border-radius:12px; }
  .stat-number { font-size:25px; }
  .section-head { flex-direction:column; align-items:flex-start; gap:6px; }
  .pac-access-card { align-items:stretch; flex-direction:column; gap:18px; padding:18px; }
  .pac-access-actions { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); justify-content:stretch; }
  .pac-access-link,.pac-access-refresh { min-height:44px; padding:0 10px; }
  .pac-access-refresh { grid-column:1 / -1; }
  .rule-tabs { grid-template-columns:repeat(2,minmax(0,1fr)); gap:5px; padding:4px; }
  .rule-tabs button { gap:6px; padding:0 8px; font-size:12px; }
  .rule-tabs button strong { min-width:20px; min-height:20px; padding:0 4px; }
  .domain-check-form { grid-template-columns:minmax(0,1fr); }
  .domain-check-form input { min-height:44px; font-size:16px; }
  .domain-check-form button { width:100%; min-height:44px; }
  .action-button { min-height:42px; }
  .source-actions a,.source-actions button { min-height:36px; padding-right:8px; padding-left:8px; }
}
</style>
