<script setup lang="ts">
import AppHeader from "@/components/AppHeader.vue";
import AppFooter from "@/components/AppFooter.vue";
import RuleVirtualList from "@/features/domain-rules/components/RuleVirtualList.vue";
import AppIcon from "@/components/AppIcon.vue";
import AppInput from "@/components/AppInput.vue";
import { useStatusDashboard } from "@/composables/useStatusDashboard";
import { resolveApiUrl } from "@/api/runtime-config";

// PAC links must follow the configured backend origin: a purely static
// frontend is served from a different host than `/pac`. Resolved lazily
// so it always reflects the loaded runtime config.
const pacUrl = () => resolveApiUrl("/pac");

const {
  t,
  locale,
  status,
  meta,
  error,
  loading,
  adminEntry,
  loadStatus,
  hasRuleSummary,
  statusModeLabel,
  statusNotice,
  formattedUpdatedAt,
  domainInput,
  checkedDomain,
  activeRuleType,
  directEntries,
  blockEntries,
  checkDomain,
  domainRoute,
} = useStatusDashboard();
</script>

<template>
  <main class="page status-page">
    <AppHeader brand="PacPilot" :sub="t('status.sub')">
      <RouterLink v-if="meta?.adminEnabled" class="primary" :to="adminEntry">{{
        t("nav.admin")
      }}</RouterLink>
    </AppHeader>

    <section class="page-hero">
      <div class="page-kicker">{{ t("status.kicker") }}</div>
      <h1 class="page-title">{{ t("status.title") }}</h1>
      <p class="page-intro">
        {{ t("statusPage.k11") }}
        <code>/pac</code>
        {{ t("statusPage.k12") }}
      </p>
      <div v-if="status" class="hero-meta">
        <span class="status-indicator" :class="status.hasPac ? 'online' : 'idle'"></span>
        <strong>{{ statusModeLabel }}</strong
        ><span class="meta-divider">·</span>
        <span>{{
          status.hasPac ? t("status.generatedAt", { time: formattedUpdatedAt }) : t("status.noFile")
        }}</span>
      </div>
    </section>

    <section v-if="status?.hasPac" class="pac-access-card" :aria-label="t('status.pacOps')">
      <div class="pac-access-copy">
        <span class="pac-access-kicker"
          ><AppIcon name="file-check-2" :size="14" /> {{ t("status.currentPac") }}</span
        >
        <h2>{{ t("status.getPac") }}</h2>
        <p>{{ t("status.getPacDesc") }}</p>
        <span class="pac-access-updated">{{
          t("status.lastGenerated", { time: formattedUpdatedAt })
        }}</span>
      </div>
      <div class="pac-access-actions">
        <a
          class="pac-access-link primary"
          :href="pacUrl()"
          target="_blank"
          rel="noopener noreferrer"
        >
          <AppIcon name="external-link" :size="17" />{{ t("status.viewPac") }}
        </a>
        <a class="pac-access-link secondary" :href="pacUrl() + '?download=1'">
          <AppIcon name="download" :size="17" />{{ t("status.downloadPac") }}
        </a>
        <button
          class="pac-access-refresh"
          type="button"
          :class="{ 'is-loading': loading }"
          @click="loadStatus"
          :disabled="loading"
          :title="loading ? t('statusPage.refreshingTitle') : t('statusPage.refreshTitle')"
        >
          <AppIcon
            :name="loading ? 'loader-circle' : 'refresh-cw'"
            :class="{ 'icon-spinning': loading }"
            :size="15"
          />
          {{ loading ? t("common.refreshing") : t("common.refresh") }}
        </button>
      </div>
    </section>

    <section v-if="loading" class="state-card" aria-live="polite">
      <span class="spinner" aria-hidden="true"></span>
      <div>
        <strong>{{ t("statusPage.k13") }}</strong>
        <p>{{ t("statusPage.checking") }}</p>
      </div>
    </section>

    <section v-else-if="error" class="state-card error-card" role="alert">
      <div class="state-icon"><AppIcon name="circle-alert" :size="18" /></div>
      <div class="state-copy">
        <strong>{{ t("statusPage.k14") }}</strong>
        <p>{{ error }}</p>
        <button class="app-button app-button--secondary" type="button" @click="loadStatus">
          {{ t("statusPage.k15") }}
        </button>
      </div>
    </section>

    <template v-else-if="status">
      <section v-if="status.mode === 'empty'" class="empty-hero">
        <div class="empty-icon" aria-hidden="true">
          <AppIcon name="file-cog" :size="26" :stroke-width="1.7" />
        </div>
        <h2>{{ t("statusPage.k16") }}</h2>
        <p>
          {{ t("statusPage.emptyHint") }}
        </p>
        <p class="empty-pac-note">
          {{ t("statusPage.k17") }}<code>{{ pacUrl() }}</code>
          {{ t("statusPage.k18") }}
        </p>
        <RouterLink class="app-button app-button--primary" :to="adminEntry">{{ t("nav.admin") }}</RouterLink>
      </section>

      <template v-else-if="hasRuleSummary">
        <section
          class="stats-grid"
          :class="status.mode === 'remote' ? 'remote-stats' : 'custom-stats'"
        >
          <article v-if="status.mode === 'remote'" class="stat-card">
            <span class="stat-label">{{ t("statusPage.k19") }}</span
            ><strong class="stat-number">{{ status.remoteProxyCount }}</strong
            ><span class="stat-caption">{{ t("statusPage.k20") }}</span>
          </article>
          <article v-if="status.mode === 'remote'" class="stat-card">
            <span class="stat-label">{{ t("statusPage.k21") }}</span
            ><strong class="stat-number">{{ status.remoteDirectCount }}</strong
            ><span class="stat-caption">{{ t("statusPage.k22") }}</span>
          </article>
          <article class="stat-card">
            <span class="stat-label">{{ t("statusPage.k23") }}</span
            ><strong class="stat-number">{{ directEntries.length }}</strong
            ><span class="stat-caption">{{
              t(status.mode === "remote" ? "statusPage.remoteDirectCaption" : "statusPage.k24")
            }}</span>
          </article>
          <article class="stat-card">
            <span class="stat-label">{{ t("statusPage.k25") }}</span
            ><strong class="stat-number">{{ status.blockList.length }}</strong
            ><span class="stat-caption">{{ t("statusPage.k26") }}</span>
          </article>
          <article v-if="status.mode === 'custom'" class="stat-card stat-card-wide stat-proxy-card">
            <div class="proxy-card-heading">
              <span class="stat-label">{{ t("statusPage.k27") }}</span>
              <span class="proxy-card-badge"
                ><AppIcon name="route" :size="13" />{{ t("statusPage.k28") }}</span
              >
            </div>
            <strong class="stat-proxy">{{ status.pacProxy || t("statusPage.k4") }}</strong>
            <span class="stat-caption">{{ t("statusPage.k29") }}</span>
          </article>
        </section>

        <section class="domain-check section-card">
          <div class="domain-check-head">
            <div>
              <h2>{{ t("statusPage.k30") }}</h2>
              <p>{{ t("statusPage.k31") }}</p>
            </div>
          </div>
          <form class="domain-check-form" @submit.prevent="checkDomain">
            <AppInput
              v-model="domainInput"
              type="text"
              inputmode="url"
              autocomplete="off"
              spellcheck="false"
              :aria-label="t('statusPage.k5')"
              :placeholder="t('statusPage.k6')"
            />
            <button
              type="submit"
              class="app-button app-button--primary"
              :disabled="!domainInput.trim()"
              :title="
                !domainInput.trim()
                  ? t('statusPage.enterDomainToCheckTitle')
                  : t('statusPage.checkDomainTitle')
              "
            >
              {{ t("statusPage.k32") }}
            </button>
          </form>
          <p class="domain-check-note">
            {{ t("statusPage.k33") }}
          </p>
          <div
            v-if="domainRoute"
            class="domain-check-result"
            :class="'result-' + domainRoute.kind"
            role="status"
            aria-live="polite"
          >
            <span class="result-mark" aria-hidden="true">
              <AppIcon
                :name="
                  domainRoute.kind === 'direct'
                    ? 'circle-check'
                    : domainRoute.kind === 'proxy'
                      ? 'route'
                      : domainRoute.kind === 'blocked'
                        ? 'circle-x'
                        : 'circle-alert'
                "
                :size="17"
              />
            </span>
            <div class="result-copy">
              <div class="result-title-row">
                <strong>{{ domainRoute.title }}</strong>
                <code>{{ domainRoute.host }}</code>
              </div>
              <p>{{ domainRoute.detail }}</p>
              <p v-if="domainRoute.matchedRule" class="matched-rule">
                <span>{{ t("statusPage.k34") }}</span
                ><code>{{ domainRoute.matchedRule }}</code
                ><span>· {{ domainRoute.source }}</span>
              </p>
              <p v-else-if="domainRoute.source" class="matched-rule">
                <span>{{ domainRoute.source }}</span>
              </p>
            </div>
          </div>
        </section>

        <section class="rules-section section-card">
          <div class="section-head rules-section-head">
            <div>
              <h2>{{ t("statusPage.k35") }}</h2>
              <p class="section-description">
                {{ t("statusPage.k36") }}
              </p>
            </div>
            <RouterLink v-if="meta?.adminEnabled" to="/admin/settings" class="text-link"
              >{{ t("statusPage.k37") }} <AppIcon name="arrow-right" :size="14"
            /></RouterLink>
          </div>

          <div class="rule-tabs" role="tablist" :aria-label="t('statusPage.k8')">
            <button
              type="button"
              role="tab"
              :aria-selected="activeRuleType === 'direct'"
              :class="{ active: activeRuleType === 'direct' }"
              @click="activeRuleType = 'direct'"
            >
              <span class="rule-dot direct-dot"></span><span>{{ t("statusPage.k38") }}</span
              ><strong>{{ directEntries.length }}</strong>
            </button>

            <button
              type="button"
              role="tab"
              :aria-selected="activeRuleType === 'block'"
              :class="{ active: activeRuleType === 'block' }"
              @click="activeRuleType = 'block'"
            >
              <span class="rule-dot block-dot"></span><span>{{ t("statusPage.k39") }}</span
              ><strong>{{ blockEntries.length }}</strong>
            </button>
          </div>

          <div class="rule-content" role="tabpanel">
            <template v-if="activeRuleType === 'direct'">
              <p class="rule-description">
                {{ t("statusPage.k40") }}
              </p>
              <RuleVirtualList
                :items="directEntries"
                :empty-text="t('statusPage.k9')"
                :height="300"
              />
            </template>
            <template v-else>
              <p class="rule-description">
                {{ t("statusPage.k41") }}
              </p>
              <RuleVirtualList
                :items="blockEntries"
                :empty-text="t('statusPage.k10')"
                :height="300"
              />
            </template>
          </div>
        </section>
      </template>

      <section v-else class="state-card warning-card">
        <div class="state-icon"><AppIcon name="info" :size="18" /></div>
        <div class="state-copy">
          <strong>{{ statusModeLabel }}</strong>
          <p>{{ statusNotice }}</p>
        </div>
      </section>
    </template>
    <AppFooter />
  </main>
</template>

<style scoped>
@reference "@/styles/tailwind.css";

.status-page {
  @apply mx-auto pb-14;
  width: min(1080px, calc(100% - var(--page-pad) * 2));
}
.page-hero {
  @apply relative mb-[22px] overflow-hidden rounded-[18px] border p-[clamp(22px,3.8vw,34px)_clamp(22px,4vw,38px)];
  border-color: color-mix(in srgb, var(--accent) 15%, var(--line));
  background: linear-gradient(128deg, color-mix(in srgb, var(--accent) 7%, var(--surface)) 0%, var(--surface) 72%);
  box-shadow: var(--shadow);
}
.page-hero::before {
  @apply absolute left-0 w-[3px] rounded-r-md;
  top: 18px;
  bottom: 18px;
  background: var(--accent);
  content: "";
}
.status-page .page-kicker {
  @apply inline-flex min-h-[25px] items-center rounded-full px-[9px] py-1 text-[10px] tracking-[0.12em];
  background: var(--accent-soft);
  color: var(--accent);
}
.status-page .page-title {
  @apply mb-2.5 mt-3 leading-[1.18] tracking-[-0.045em];
  font-size: clamp(1.8rem, 4vw, 2.35rem);
}
.status-page .page-intro {
  @apply max-w-[760px] text-[13px] leading-[1.75];
}
.hero-meta {
  @apply mt-5 inline-flex flex-wrap items-center gap-[9px] rounded-[10px] border px-3 py-2 text-[11px];
  border-color: var(--line);
  background: color-mix(in srgb, var(--surface) 88%, transparent);
  color: var(--muted);
}
.hero-meta strong {
  @apply font-semibold;
  color: var(--text);
}
.meta-divider {
  @apply opacity-60;
}
.status-indicator {
  @apply inline-block h-2 w-2 rounded-full;
  background: var(--muted);
}
.status-indicator.online {
  background: var(--green);
  box-shadow: 0 0 0 3px var(--green-soft);
}
.status-indicator.idle {
  background: var(--warn);
}
.stats-grid {
  @apply mb-[22px] grid gap-3.5;
}
.remote-stats {
  @apply grid-cols-4;
}
.custom-stats {
  @apply grid-cols-2;
}
.stat-card {
  @apply relative min-w-0 rounded-[15px] border px-5 py-[19px] transition-[border-color,transform];
  min-height: 120px;
  border-color: var(--line);
  background: var(--surface);
  box-shadow: var(--shadow);
}
.stat-card:hover {
  @apply -translate-y-px;
  border-color: color-mix(in srgb, var(--accent) 30%, var(--line));
}
.stat-card-wide {
  @apply col-span-full;
}
.stat-label {
  @apply mb-[11px] block text-[11px] font-bold tracking-[0.02em];
  color: var(--muted);
}
.stat-number {
  @apply block leading-none tracking-[-0.04em] tabular-nums;
  font-size: clamp(25px, 3vw, 32px);
  line-height: 1.1;
}
.stat-caption {
  @apply mt-[9px] block text-[11px] leading-normal;
  color: var(--muted);
}
.stat-proxy {
  @apply block font-mono font-bold;
  overflow-wrap: anywhere;
  color: var(--accent);
  font-size: clamp(13px, 1.7vw, 16px);
  line-height: 1.55;
}
.stat-proxy-card {
  border-color: color-mix(in srgb, var(--accent) 30%, var(--line));
  background: linear-gradient(112deg, color-mix(in srgb, var(--accent) 9%, var(--surface)), var(--surface) 78%);
}
.proxy-card-heading {
  @apply flex items-center justify-between gap-3;
}
.proxy-card-heading .stat-label {
  @apply mb-[13px];
}
.proxy-card-badge {
  @apply inline-flex shrink-0 items-center gap-[5px] rounded-full border px-2 py-[5px] text-[10px] font-bold;
  border-color: color-mix(in srgb, var(--accent) 22%, var(--line));
  background: var(--accent-soft);
  color: var(--accent);
}
.section-card,
.empty-hero {
  @apply rounded-[var(--radius)] border;
  border-color: var(--line);
  background: var(--surface);
  box-shadow: var(--shadow);
}
.section-card {
  @apply mb-5 p-[clamp(17px,2.8vw,26px)];
}
.section-head {
  @apply mb-[18px] flex items-start justify-between gap-4;
}
.section-head h2 {
  @apply m-0 text-lg tracking-tight;
}
.rules-section {
  @apply mt-0;
}
.rules-section-head {
  @apply mb-4 items-end;
}
.section-description {
  @apply mb-0 mt-[7px] text-xs;
  color: var(--muted);
}
.text-link {
  @apply inline-flex items-center gap-[5px] whitespace-nowrap text-xs font-semibold;
  color: var(--accent);
}
.domain-check {
  @apply mb-[22px];
}
.domain-check-head h2 {
  @apply m-0 text-lg tracking-tight;
}
.domain-check-head p {
  @apply mb-0 mt-[7px] text-xs;
  color: var(--muted);
}
.domain-check-form {
  @apply mt-4 grid gap-2.5;
  grid-template-columns: minmax(0, 1fr) auto;
}
.domain-check-form .app-input {
  background: var(--bg);
}
.domain-check-form button {
  @apply whitespace-nowrap;
}
.domain-check-note {
  @apply mb-0 mt-2 text-[11px] leading-normal;
  color: var(--muted);
}
.domain-check-result {
  @apply mt-4 flex items-start gap-3 rounded-[9px] border px-3.5 py-[13px];
  border-color: var(--line);
  background: var(--surface-2);
}
.result-mark {
  @apply grid h-[30px] w-[30px] shrink-0 place-items-center rounded-lg text-base font-extrabold;
}
.result-direct .result-mark {
  color: var(--green);
  background: var(--green-soft);
}
.result-proxy .result-mark {
  color: var(--accent);
  background: var(--accent-soft);
}
.result-blocked .result-mark {
  color: var(--red);
  background: var(--red-soft);
}
.result-unknown .result-mark,
.result-invalid .result-mark {
  color: var(--warn);
  background: var(--warn-soft);
}
.result-copy {
  @apply min-w-0 flex-1;
}
.result-title-row {
  @apply flex flex-wrap items-baseline gap-[9px];
}
.result-title-row strong {
  @apply text-sm;
}
.result-title-row code {
  @apply text-xs;
  color: var(--muted);
  overflow-wrap: anywhere;
}
.result-copy > p {
  @apply mb-0 mt-1.5 text-xs leading-normal;
  color: var(--muted);
}
.result-copy .matched-rule {
  @apply mt-[9px] flex flex-wrap items-baseline gap-[7px];
}
.matched-rule code {
  @apply rounded-[5px] px-1.5 py-[3px] text-[11px];
  background: var(--bg);
  color: var(--text);
  overflow-wrap: anywhere;
}
.rule-tabs {
  @apply mb-3.5 grid grid-cols-2 gap-1.5 rounded-[10px] border p-[5px];
  border-color: var(--line);
  background: var(--surface-2);
}
.rule-tabs button {
  @apply flex min-h-10 min-w-0 cursor-pointer items-center justify-center gap-[7px] rounded-[7px] border border-transparent bg-transparent px-2.5 text-xs font-semibold transition-[background,border-color,color,box-shadow];
  color: var(--muted);
}
.rule-tabs button:hover {
  background: var(--surface);
  color: var(--text);
}
.rule-tabs button:active {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--accent);
}
.rule-tabs button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.rule-tabs button.active {
  color: var(--text);
  border-color: color-mix(in srgb, var(--accent) 38%, var(--line));
  background: var(--surface);
  box-shadow: 0 1px 2px rgba(26, 35, 50, 0.06);
}
.rule-tabs button strong {
  @apply ml-px inline-flex min-h-[22px] min-w-6 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-bold leading-none tabular-nums;
  background: var(--bg);
  color: var(--muted);
}
.rule-tabs button.active strong {
  background: var(--accent-soft);
  color: var(--accent);
}
.rule-dot {
  @apply h-2 w-2 shrink-0 rounded-full;
}
.direct-dot {
  background: var(--green);
}
.proxy-dot {
  background: var(--accent);
}
.block-dot {
  background: var(--red);
}
.rule-content {
  @apply min-w-0;
}
.rule-description {
  @apply mb-2.5 mt-0 text-xs leading-normal;
  color: var(--muted);
}
.default-proxy {
  @apply flex flex-col items-start gap-2 rounded-[10px] border p-4;
  border-color: color-mix(in srgb, var(--accent) 26%, var(--line));
  background: linear-gradient(112deg, color-mix(in srgb, var(--accent) 7%, var(--surface)), var(--surface) 82%);
}
.default-proxy span {
  @apply text-[11px] font-semibold;
  color: var(--muted);
}
.default-proxy code {
  @apply max-w-full rounded-[7px] border px-[9px] py-[7px] font-mono text-[13px] font-bold leading-normal;
  border-color: color-mix(in srgb, var(--accent) 18%, var(--line));
  background: var(--accent-soft);
  color: var(--accent);
  overflow-wrap: anywhere;
}
.default-proxy p {
  @apply m-0 text-xs leading-normal;
  color: var(--muted);
}
.pac-access-card {
  @apply mb-[22px] mt-0 flex items-center justify-between gap-6 rounded-[17px] border p-[clamp(20px,3vw,28px)];
  border-color: color-mix(in srgb, var(--accent) 24%, var(--line));
  background: linear-gradient(115deg, color-mix(in srgb, var(--accent) 8%, var(--surface)), var(--surface) 74%);
  box-shadow: var(--shadow);
}
.pac-access-copy {
  @apply min-w-0;
}
.pac-access-kicker {
  @apply inline-flex items-center gap-1.5 text-[11px] font-bold;
  color: var(--accent);
}
.pac-access-copy h2 {
  @apply mb-1.5 mt-2.5 tracking-tight;
  color: var(--text);
  font-size: clamp(1.15rem, 2.6vw, 1.45rem);
}
.pac-access-copy p {
  @apply m-0 text-xs leading-normal;
  color: var(--muted);
}
.pac-access-updated {
  @apply mt-3 block text-[11px] tabular-nums;
  color: var(--muted);
}
.pac-access-actions {
  @apply flex shrink-0 flex-wrap items-center justify-end gap-2;
}
.pac-access-link,
.pac-access-refresh {
  @apply inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-[10px] border px-4 text-xs font-bold no-underline transition-[background,border-color,transform];
  border-color: var(--line);
}
.pac-access-link.primary {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--accent-contrast);
  box-shadow: 0 4px 12px color-mix(in srgb, var(--accent) 18%, transparent);
}
.pac-access-link.primary:hover {
  @apply -translate-y-px no-underline;
  filter: brightness(1.04);
}
.pac-access-link.secondary {
  background: var(--surface);
  color: var(--text);
}
.pac-access-link.secondary:hover,
.pac-access-refresh:hover:not(:disabled) {
  @apply no-underline;
  border-color: color-mix(in srgb, var(--accent) 45%, var(--line));
  background: var(--surface-2);
}
.pac-access-refresh {
  @apply bg-transparent;
  color: var(--accent);
}
.pac-access-refresh:disabled {
  @apply cursor-not-allowed;
  color: var(--control-disabled-text);
  background: var(--control-disabled-bg);
  border-color: var(--control-disabled-border);
}
.pac-access-refresh.is-loading:disabled {
  @apply cursor-progress;
  color: var(--text);
  background: var(--surface);
  border-color: var(--line);
}
.pac-access-link:focus-visible,
.pac-access-refresh:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}
.state-card {
  @apply flex items-start gap-3.5 rounded-[var(--radius)] border p-[18px];
  border-color: var(--line);
  background: var(--surface);
}
.state-card strong {
  @apply text-sm;
}
.state-card p {
  @apply mb-3 mt-[5px] text-[13px];
  color: var(--muted);
}
.error-card,
.warning-card {
  border-color: color-mix(in srgb, var(--warn) 38%, var(--line));
}
.state-icon,
.empty-icon {
  @apply grid h-9 w-9 shrink-0 place-items-center rounded-[10px] font-bold;
  background: var(--surface-2);
  color: var(--muted);
}
.empty-hero {
  @apply p-[clamp(24px,6vw,42px)] text-center;
}
.empty-icon {
  @apply mx-auto mb-3.5 h-12 w-12 text-2xl;
  color: var(--accent);
}
.empty-hero h2 {
  @apply m-0 text-[19px];
}
.empty-hero p {
  @apply mx-auto mb-[18px] mt-2.5 max-w-[36em] text-[13px];
  color: var(--muted);
}
.empty-hero .empty-pac-note {
  @apply -mt-2 text-[11px] leading-normal;
}
.spinner {
  @apply h-[18px] w-[18px] shrink-0 animate-[spin_0.8s_linear_infinite] rounded-full border-2;
  border-color: var(--line);
  border-top-color: var(--accent);
}
.state-copy {
  @apply min-w-0;
}
.icon-spinning {
  animation: status-icon-spin 0.9s linear infinite;
}
@keyframes status-icon-spin {
  to {
    transform: rotate(360deg);
  }
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@media (max-width: 960px) {
  .remote-stats,
  .custom-stats {
    @apply grid-cols-2;
  }
}
@media (max-width: 480px) {
  .remote-stats,
  .custom-stats {
    @apply grid-cols-2 gap-2;
  }
  .page-hero {
    @apply rounded-[15px] py-[22px] pl-[22px] pr-[18px];
  }
  .status-page .page-title {
    font-size: clamp(1.65rem, 7vw, 2rem);
  }
  .status-page .page-intro {
    @apply text-xs;
  }
  .hero-meta {
    @apply items-start gap-[7px] rounded-[10px];
  }
  .stats-grid {
    @apply gap-2;
  }
  .stat-card {
    @apply rounded-xl px-3 py-[13px];
    min-height: 108px;
  }
  .stat-number {
    @apply text-[25px];
  }
  .section-head {
    @apply flex-col items-start gap-1.5;
  }
  .pac-access-card {
    @apply flex-col items-stretch gap-[18px] p-[18px];
  }
  .pac-access-actions {
    @apply grid grid-cols-2 justify-stretch;
  }
  .pac-access-link,
  .pac-access-refresh {
    @apply min-h-11 px-2.5;
  }
  .pac-access-refresh {
    @apply col-span-full;
  }
  .rule-tabs {
    @apply grid-cols-2 gap-[5px] p-1;
  }
  .rule-tabs button {
    @apply gap-1.5 px-2 text-xs;
  }
  .rule-tabs button strong {
    @apply min-h-5 min-w-5 px-1;
  }
  .domain-check-form {
    @apply grid-cols-1;
  }
  .domain-check-form .app-input {
    @apply min-h-11 text-base;
  }
  .domain-check-form button {
    @apply w-full min-h-11;
  }
  .app-button {
    @apply min-h-[42px];
  }
  .source-actions a,
  .source-actions button {
    @apply min-h-9 px-2;
  }
}
</style>
