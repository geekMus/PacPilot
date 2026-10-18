<script setup lang="ts">
import { onMounted, ref, computed } from "vue";
import { api, type Meta, type PacStatus } from "../api/client";
import AppHeader from "../components/AppHeader.vue";

const status = ref<PacStatus | null>(null);
const meta = ref<Meta | null>(null);
const error = ref("");
const query = ref("");
const loading = ref(true);

onMounted(async () => {
  try {
    const [s, m] = await Promise.all([api.status(), api.meta()]);
    status.value = s;
    meta.value = m;
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
});

const filteredDirect = computed(() => {
  const list = status.value?.directList || [];
  const q = query.value.trim().toLowerCase();
  if (!q) return list;
  return list.filter((r) => r.toLowerCase().includes(q));
});

const filteredBlock = computed(() => {
  const list = status.value?.blockList || [];
  const q = query.value.trim().toLowerCase();
  if (!q) return list;
  return list.filter((r) => r.toLowerCase().includes(q));
});

function ruleDesc(rule: string) {
  return rule.includes("*") ? "按通配符模式匹配" : "根域名及所有层级的子域名";
}
</script>

<template>
  <main class="page">
    <AppHeader brand="genpac-runner" sub="Status">
      <a href="/proxy.pac">查看 PAC</a>
      <a href="/proxy.pac?download=1">下载 PAC</a>
      <RouterLink v-if="meta?.adminEnabled" class="primary" to="/admin">后台</RouterLink>
    </AppHeader>

    <section>
      <div class="kicker">Current configuration</div>
      <h1>规则状态</h1>
      <p class="intro">
        查看当前生成文件中的分流规则。这里读取的是实际
        <code>proxy.pac</code>，不是单纯展示配置。
      </p>
      <div v-if="status" class="mode">
        <span class="dot" />
        <span>当前识别：{{ status.modeLabel }}</span>
      </div>
    </section>

    <p v-if="loading" class="muted">加载中…</p>
    <p v-else-if="error" class="notice warning">{{ error }}</p>

    <template v-else-if="status">
      <div class="stats">
        <template v-if="status.mode === 'custom'">
          <div class="stat">
            <span class="stat-label">直连规则</span>
            <strong>{{ status.directList.length }}</strong>
            <span class="stat-unit">条</span>
          </div>
          <div class="stat">
            <span class="stat-label">黑名单规则</span>
            <strong>{{ status.blockList.length }}</strong>
            <span class="stat-unit">条</span>
          </div>
          <div class="stat">
            <span class="stat-label">默认代理</span>
            <strong class="stat-proxy">已启用</strong>
            <span class="stat-unit">兜底规则</span>
          </div>
        </template>
        <template v-else>
          <div class="stat">
            <span class="stat-label">规则来源</span>
            <strong class="stat-proxy">PAC 文件</strong>
            <span class="stat-unit">当前生成结果</span>
          </div>
          <div class="stat">
            <span class="stat-label">自定义列表</span>
            <strong>未确认</strong>
            <span class="stat-unit">不展示为生效规则</span>
          </div>
          <div class="stat">
            <span class="stat-label">分流策略</span>
            <strong class="stat-proxy">genpac / 其他</strong>
            <span class="stat-unit">请查看 PAC 原文</span>
          </div>
        </template>
      </div>

      <input
        v-if="status.mode === 'custom'"
        v-model="query"
        class="search"
        type="search"
        placeholder="搜索域名规则，例如 baidu.com、*.example.com"
      />

      <div v-if="status.mode === 'custom'" class="rule-grid">
        <section class="panel">
          <div class="panel-head">
            <div>
              <span class="eyebrow">DIRECT</span>
              <h2>直连规则</h2>
            </div>
            <span class="count">{{ status.directList.length }} 条</span>
          </div>
          <p class="panel-desc">命中以下规则的域名直接连接，不经过代理。</p>
          <ul class="rule-list">
            <li
              v-for="rule in filteredDirect"
              :key="'d-' + rule"
              class="rule-item"
            >
              <code>{{ rule }}</code>
              <span class="rule-desc">{{ ruleDesc(rule) }}</span>
            </li>
            <li v-if="!filteredDirect.length" class="empty-state">
              {{ query ? "无匹配规则" : "没有配置额外的直连域名。" }}
            </li>
          </ul>
        </section>

        <section class="panel">
          <div class="panel-head">
            <div>
              <span class="eyebrow">BLOCK</span>
              <h2>黑名单 / 拦截规则</h2>
            </div>
            <span class="count">{{ status.blockList.length }} 条</span>
          </div>
          <p class="panel-desc">
            命中时返回 <code>PROXY 0.0.0.0:0</code>。
          </p>
          <ul class="rule-list">
            <li
              v-for="rule in filteredBlock"
              :key="'b-' + rule"
              class="rule-item"
            >
              <code>{{ rule }}</code>
              <span class="rule-desc">{{ ruleDesc(rule) }}</span>
            </li>
            <li v-if="!filteredBlock.length" class="empty-state">
              {{ query ? "无匹配规则" : "没有配置黑名单规则。" }}
            </li>
          </ul>
        </section>
      </div>

      <div
        class="notice"
        :class="{ warning: status.mode !== 'custom' }"
      >
        <strong>{{ status.mode === "custom" ? "默认代理范围" : "提示" }}</strong>
        {{ status.notice }}
        <template v-if="status.mode !== 'custom'">
          <a href="/proxy.pac"> 查看 PAC 原文</a>
        </template>
      </div>

      <section class="policy">
        <h2>内置直连策略与规则优先级</h2>
        <ul>
          <li>
            本地和内网优先直连：<code>localhost</code>、无点号主机名，以及
            RFC1918 网段。
          </li>
          <li>之后依次检查黑名单、额外直连列表；未命中时使用默认代理。</li>
          <li>
            不带 <code>*</code> 的规则匹配根域名及子域名；带
            <code>*</code> 的按通配符匹配。
          </li>
        </ul>
      </section>

      <footer>
        <span>配置读取时间：{{ status.updatedAt }}</span>
        <span>刷新即可更新</span>
      </footer>
    </template>
  </main>
</template>

<style scoped>
.wrap {
  width: min(1020px, calc(100% - 32px));
  margin: 36px auto 56px;
}
.kicker {
  color: var(--accent);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}
h1 {
  font-size: clamp(28px, 5vw, 40px);
  letter-spacing: -0.035em;
  line-height: 1.16;
  margin: 9px 0 12px;
}
.intro {
  color: var(--muted);
  max-width: 680px;
  margin: 0;
}
.mode {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--line);
  background: var(--surface);
  padding: 7px 11px;
  border-radius: 999px;
  font-size: 13px;
  margin-top: 18px;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--green);
}
.stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  margin: 28px 0;
}
.stat,
.panel,
.notice,
.policy {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
}
.stat {
  padding: 19px 20px;
  min-height: 112px;
}
.stat-label {
  display: block;
  font-size: 13px;
  color: var(--muted);
  margin-bottom: 8px;
}
.stat strong {
  font-size: 28px;
  line-height: 1.15;
  letter-spacing: -0.035em;
}
.stat-unit {
  font-size: 12px;
  color: var(--muted);
  margin-left: 7px;
}
.stat .stat-proxy {
  font-size: 19px;
  letter-spacing: 0;
}
.search {
  width: 100%;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--text);
  padding: 12px 14px;
  border-radius: 12px;
  outline: none;
  margin-bottom: 18px;
}
.search:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 17%, transparent);
}
.rule-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.panel {
  padding: 21px;
  min-width: 0;
}
.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.eyebrow {
  color: var(--muted);
  font-weight: 800;
  letter-spacing: 0.13em;
  font-size: 10px;
}
h2 {
  font-size: 20px;
  margin: 2px 0 0;
  letter-spacing: -0.02em;
}
.count {
  white-space: nowrap;
  border-radius: 999px;
  padding: 4px 9px;
  background: var(--bg);
  color: var(--muted);
  font-size: 12px;
}
.panel-desc {
  font-size: 13px;
  color: var(--muted);
  min-height: 42px;
  margin: 14px 0;
}
.rule-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 8px;
}
.rule-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  padding: 10px 11px;
  border: 1px solid var(--line);
  border-radius: 10px;
  min-width: 0;
}
.rule-item code {
  overflow-wrap: anywhere;
  color: var(--text);
}
.rule-desc {
  flex-shrink: 0;
  color: var(--muted);
  font-size: 11px;
  text-align: right;
}
.empty-state {
  padding: 17px 12px;
  text-align: center;
  color: var(--muted);
  border: 1px dashed var(--line);
  border-radius: 10px;
  font-size: 13px;
}
.notice {
  padding: 17px 19px;
  margin-top: 16px;
  color: var(--muted);
  font-size: 14px;
}
.notice strong {
  display: block;
  color: var(--text);
  margin-bottom: 5px;
}
.notice.warning {
  border-color: color-mix(in srgb, var(--warn) 45%, var(--line));
}
.policy {
  padding: 20px;
  margin-top: 16px;
}
.policy h2 {
  margin-bottom: 10px;
}
.policy ul {
  margin: 0;
  padding-left: 20px;
  color: var(--muted);
  font-size: 14px;
}
.policy li + li {
  margin-top: 4px;
}
footer {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  color: var(--muted);
  font-size: 12px;
  margin-top: 26px;
}
.muted {
  color: var(--muted);
}
@media (max-width: 700px) {
  .stats,
  .rule-grid {
    grid-template-columns: 1fr;
  }
  .stat {
    min-height: auto;
  }
  .rule-item {
    flex-direction: column;
    align-items: flex-start;
  }
  .rule-desc {
    text-align: left;
  }
}
</style>
