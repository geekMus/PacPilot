<script setup lang="ts">
import { onMounted, ref, computed } from "vue";
import { api, type Meta, type PacStatus } from "../api/client";
import AppHeader from "../components/AppHeader.vue";

const status = ref<PacStatus | null>(null);
const meta = ref<Meta | null>(null);
const error = ref("");
const query = ref("");
const loading = ref(true);

async function loadStatus() {
  loading.value = true;
  error.value = "";
  try {
    const [currentStatus, currentMeta] = await Promise.all([api.status(), api.meta()]);
    status.value = currentStatus;
    meta.value = currentMeta;
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}
onMounted(loadStatus);

const hasRuleSummary = computed(() =>
  status.value?.mode === "custom" || status.value?.mode === "remote"
);
const filteredDirect = computed(() => {
  const list = status.value?.directList || [];
  const q = query.value.trim().toLowerCase();
  return q ? list.filter((rule) => rule.toLowerCase().includes(q)) : list;
});
const filteredBlock = computed(() => {
  const list = status.value?.blockList || [];
  const q = query.value.trim().toLowerCase();
  return q ? list.filter((rule) => rule.toLowerCase().includes(q)) : list;
});
function ruleDesc(rule: string) {
  return rule.includes("*") ? "通配符匹配" : "根域名及其子域名";
}
</script>

<template>
  <main class="page status-page">
    <AppHeader brand="genpac-runner" sub="运行概览">
      <a href="/proxy.pac" target="_blank" rel="noopener noreferrer">查看 PAC</a>
      <RouterLink v-if="meta?.adminEnabled" class="primary" to="/admin">配置管理</RouterLink>
    </AppHeader>

    <section class="page-hero">
      <div class="page-kicker">运行状态</div>
      <h1 class="page-title">PAC 规则概览</h1>
      <p class="page-intro">这里展示已经写入 <code>proxy.pac</code> 的实际规则。简单来说，规则决定一个域名是直连、走代理，还是被拦截。</p>
      <div v-if="status" class="hero-meta">
        <span class="status-indicator" :class="status.hasPac ? 'online' : 'idle'"></span>
        <strong>{{ status.modeLabel }}</strong><span class="meta-divider">·</span>
        <span>{{ status.hasPac ? `生成时间：${status.updatedAt}` : "尚无生成文件" }}</span>
      </div>
    </section>

    <section v-if="loading" class="state-card" aria-live="polite">
      <span class="spinner" aria-hidden="true"></span>
      <div><strong>正在读取运行状态</strong><p>正在检查当前 PAC 文件和生成模式。</p></div>
    </section>

    <section v-else-if="error" class="state-card error-card" role="alert">
      <div class="state-icon">!</div>
      <div class="state-copy"><strong>无法读取状态</strong><p>{{ error }}</p><button class="action-button" type="button" @click="loadStatus">重新加载</button></div>
    </section>

    <template v-else-if="status">
      <section v-if="status.mode === 'empty'" class="empty-hero">
        <div class="empty-icon" aria-hidden="true">↗</div>
        <h2>还没有生成 PAC</h2>
        <p>先进入配置管理，设置启动模式和规则，然后点击「保存并生成 PAC」。生成后，这里会显示实际写入文件的规则摘要。</p>
        <RouterLink v-if="meta?.adminEnabled" class="action-button primary" to="/admin">前往配置管理</RouterLink>
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
          <article v-if="status.mode === 'custom'" class="stat-card stat-card-wide">
            <span class="stat-label">默认代理</span><strong class="stat-proxy">{{ status.pacProxy || "未识别" }}</strong><span class="stat-caption">未命中自定义规则时使用</span>
          </article>
        </section>

        <section class="section-card">
          <div class="section-head">
            <div><div class="section-kicker">REQUEST FLOW</div><h2>请求会怎样处理？</h2></div>
            <span class="section-note">按照 PAC 中的匹配顺序</span>
          </div>
          <ol class="flow-list">
            <li><span class="flow-number">01</span><div><strong>本地与内网</strong><p>localhost、无点号主机名，以及常见私有 IPv4 网段直接连接。</p></div><span class="flow-result direct">直连</span></li>
            <li><span class="flow-number">02</span><div><strong>自定义黑名单</strong><p>先检查后台填写的黑名单，命中时返回拒绝连接的代理地址。</p></div><span class="flow-result blocked">拦截</span></li>
            <li><span class="flow-number">03</span><div><strong>自定义直连列表</strong><p>检查你在「配置管理 → 自定义规则」中填写的直连域名。</p></div><span class="flow-result direct">直连</span></li>
            <li v-if="status.mode === 'remote'"><span class="flow-number">04</span><div><strong>远程列表例外规则</strong><p>远程列表中标记为例外的域名不走代理。</p></div><span class="flow-result direct">直连</span></li>
            <li v-if="status.mode === 'remote'"><span class="flow-number">05</span><div><strong>远程代理规则</strong><p>命中远程代理域名列表后，使用配置的代理字符串。</p></div><span class="flow-result proxy">代理</span></li>
            <li><span class="flow-number">{{ status.mode === 'remote' ? '06' : '04' }}</span><div><strong>{{ status.mode === 'remote' ? "其他域名" : "未命中以上规则" }}</strong><p>{{ status.mode === 'remote' ? "不在远程代理列表中的域名默认直接连接。" : `使用默认代理：${status.pacProxy || "未识别"}。` }}</p></div><span class="flow-result" :class="status.mode === 'remote' ? 'direct' : 'proxy'">{{ status.mode === 'remote' ? "直连" : "代理" }}</span></li>
          </ol>
        </section>

        <section class="rules-section">
          <div class="section-head rules-section-head">
            <div><div class="section-kicker">YOUR RULES</div><h2>自定义规则明细</h2><p class="section-description">这些规则会在远程列表匹配前优先执行，远程模式也同样生效。</p></div>
            <RouterLink v-if="meta?.adminEnabled" to="/admin" class="text-link">编辑规则 <span aria-hidden="true">→</span></RouterLink>
          </div>
          <label class="search-box"><span aria-hidden="true">⌕</span><input v-model="query" type="search" placeholder="搜索域名，例如 baidu.com 或 *.example.com" /><kbd>搜索</kbd></label>
          <div class="rule-grid">
            <section class="rule-card">
              <div class="rule-card-head"><div class="rule-kind"><span class="rule-dot direct-dot"></span><div><h3>直连列表</h3><p>DIRECT</p></div></div><span class="rule-count">{{ status.directList.length }} 条</span></div>
              <div class="rule-list">
                <div v-for="rule in filteredDirect" :key="'direct-' + rule" class="rule-row"><code>{{ rule }}</code><span>{{ ruleDesc(rule) }}</span></div>
                <div v-if="!filteredDirect.length" class="rule-empty">{{ query ? "没有匹配的直连规则。" : "没有额外的直连规则。" }}</div>
              </div>
            </section>
            <section class="rule-card">
              <div class="rule-card-head"><div class="rule-kind"><span class="rule-dot block-dot"></span><div><h3>黑名单</h3><p>BLOCK</p></div></div><span class="rule-count">{{ status.blockList.length }} 条</span></div>
              <div class="rule-list">
                <div v-for="rule in filteredBlock" :key="'block-' + rule" class="rule-row"><code>{{ rule }}</code><span>{{ ruleDesc(rule) }}</span></div>
                <div v-if="!filteredBlock.length" class="rule-empty">{{ query ? "没有匹配的黑名单规则。" : "没有配置黑名单。" }}</div>
              </div>
            </section>
          </div>
        </section>
      </template>

      <section v-else class="state-card warning-card">
        <div class="state-icon">i</div><div class="state-copy"><strong>{{ status.modeLabel }}</strong><p>{{ status.notice }}</p><a href="/proxy.pac" target="_blank" rel="noopener noreferrer" class="action-button">查看 PAC 原文</a></div>
      </section>

      <section v-if="status.mode !== 'empty'" class="source-footer">
        <div><span class="source-dot"></span><span>摘要来自当前已生成的 PAC 文件</span></div>
        <div class="source-actions"><span>最近文件时间：{{ status.updatedAt }}</span><a href="/proxy.pac" target="_blank" rel="noopener noreferrer">查看原文</a><a href="/proxy.pac?download=1">下载 PAC</a><button type="button" @click="loadStatus">刷新状态</button></div>
      </section>
    </template>
  </main>
</template>

<style scoped>
.status-page { padding-bottom:52px; }
.page-hero { margin-bottom:24px; }
.page-kicker { color:var(--accent); }
.page-title { margin-bottom:10px; }
.page-intro { max-width:690px; }
.hero-meta { display:inline-flex; align-items:center; flex-wrap:wrap; gap:9px; margin-top:18px; padding:8px 12px; border:1px solid var(--line); border-radius:999px; background:var(--surface); color:var(--muted); font-size:12px; }
.hero-meta strong { color:var(--text); font-weight:650; }
.meta-divider { opacity:.6; }
.status-indicator { display:inline-block; width:8px; height:8px; border-radius:50%; background:var(--muted); }
.status-indicator.online { background:var(--green); box-shadow:0 0 0 3px var(--green-soft); }
.status-indicator.idle { background:var(--warn); }
.stats-grid { display:grid; gap:12px; margin-bottom:22px; }
.remote-stats { grid-template-columns:repeat(4,minmax(0,1fr)); }
.custom-stats { grid-template-columns:repeat(3,minmax(0,1fr)); }
.stat-card { min-width:0; min-height:128px; padding:17px 18px; border:1px solid var(--line); border-radius:var(--radius); background:var(--surface); box-shadow:var(--shadow); }
.stat-label { display:block; color:var(--muted); font-size:12px; font-weight:600; margin-bottom:10px; }
.stat-number { display:block; font-size:clamp(25px,3vw,32px); line-height:1.1; letter-spacing:-.04em; font-variant-numeric:tabular-nums; }
.stat-caption { display:block; color:var(--muted); font-size:11px; line-height:1.4; margin-top:8px; }
.stat-proxy { display:block; overflow-wrap:anywhere; font:600 13px/1.5 var(--font-mono); }
.section-card,.rule-card,.empty-hero { border:1px solid var(--line); border-radius:var(--radius); background:var(--surface); box-shadow:var(--shadow); }
.section-card { padding:clamp(16px,2.8vw,24px); margin-bottom:20px; }
.section-head { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; margin-bottom:18px; }
.section-kicker { color:var(--muted); font:700 10px/1.3 var(--font-mono); letter-spacing:.15em; margin-bottom:5px; }
.section-head h2 { margin:0; font-size:18px; letter-spacing:-.02em; }
.section-note { color:var(--muted); font-size:11px; padding-top:5px; text-align:right; }
.flow-list { list-style:none; padding:0; margin:0; }
.flow-list li { display:grid; grid-template-columns:34px minmax(0,1fr) auto; align-items:center; gap:12px; padding:14px 0; border-top:1px solid var(--line); }
.flow-number { align-self:start; color:var(--muted); font:600 11px/1.6 var(--font-mono); }
.flow-list strong { font-size:13px; }
.flow-list p { margin:3px 0 0; color:var(--muted); font-size:12px; line-height:1.5; }
.flow-result { align-self:center; padding:4px 9px; border-radius:999px; font-size:11px; font-weight:700; white-space:nowrap; }
.flow-result.direct { color:var(--green); background:var(--green-soft); }
.flow-result.proxy { color:var(--accent); background:var(--accent-soft); }
.flow-result.blocked { color:var(--red); background:var(--red-soft); }
.rules-section { margin-top:24px; }
.rules-section-head { align-items:end; margin-bottom:14px; }
.section-description { margin:7px 0 0; color:var(--muted); font-size:12px; }
.text-link { color:var(--accent); font-size:12px; font-weight:650; white-space:nowrap; }
.search-box { display:flex; align-items:center; gap:10px; padding:0 12px; min-height:44px; border:1px solid var(--line); border-radius:var(--radius-sm); background:var(--surface); margin-bottom:14px; }
.search-box > span { color:var(--muted); font-size:21px; line-height:1; }
.search-box input { flex:1; width:100%; min-width:0; border:0; outline:0; background:transparent; color:var(--text); padding:10px 0; font-size:12px; }
.search-box input:focus { box-shadow:none; }
.search-box kbd { color:var(--muted); background:var(--surface-2); border:1px solid var(--line); border-radius:5px; padding:3px 6px; font:10px var(--font-mono); }
.rule-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; }
.rule-card { min-width:0; padding:16px; }
.rule-card-head { display:flex; justify-content:space-between; align-items:center; gap:10px; padding-bottom:13px; border-bottom:1px solid var(--line); }
.rule-kind { display:flex; align-items:center; gap:9px; }
.rule-kind h3 { margin:0; font-size:13px; }
.rule-kind p { margin:2px 0 0; color:var(--muted); font:10px var(--font-mono); }
.rule-dot { width:8px; height:8px; flex:0 0 auto; border-radius:50%; }
.direct-dot { background:var(--green); } .block-dot { background:var(--red); }
.rule-count { flex:0 0 auto; color:var(--muted); font-size:11px; }
.rule-list { display:grid; gap:7px; margin-top:12px; }
.rule-row { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:9px 10px; border:1px solid var(--line); border-radius:8px; min-width:0; }
.rule-row code { overflow-wrap:anywhere; font-size:11px; }
.rule-row span { color:var(--muted); font-size:10px; white-space:nowrap; }
.rule-empty { padding:20px 10px; text-align:center; color:var(--muted); font-size:12px; border:1px dashed var(--line); border-radius:8px; }
.source-footer { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; padding-top:18px; color:var(--muted); font-size:11px; }
.source-footer > div:first-child,.source-actions { display:flex; align-items:center; flex-wrap:wrap; gap:12px; }
.source-dot { width:7px; height:7px; border-radius:50%; background:var(--green); }
.source-actions button { appearance:none; border:0; background:transparent; color:var(--accent); font:inherit; cursor:pointer; padding:0; }
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
.action-button.primary { color:#fff; background:var(--accent); border-color:var(--accent); }
.spinner { width:18px; height:18px; border:2px solid var(--line); border-top-color:var(--accent); border-radius:50%; animation:spin .8s linear infinite; flex:0 0 auto; }
.state-copy { min-width:0; }
@keyframes spin { to { transform:rotate(360deg); } }
@media(max-width:760px) { .remote-stats,.custom-stats { grid-template-columns:repeat(2,minmax(0,1fr)); } .rule-grid { grid-template-columns:1fr; } }
@media(max-width:480px) { .remote-stats,.custom-stats { grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; } .stat-card { min-height:112px; padding:13px; } .stat-number { font-size:25px; } .section-head { flex-direction:column; gap:6px; } .section-note { text-align:left; } .flow-list li { grid-template-columns:26px minmax(0,1fr); gap:8px; } .flow-result { grid-column:2; justify-self:start; } .rule-row { align-items:flex-start; flex-direction:column; gap:4px; } .source-footer,.source-actions { align-items:flex-start; } }
</style>
