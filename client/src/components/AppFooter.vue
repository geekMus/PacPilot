<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import packageJson from "../../../package.json";
import { api, type UpdateInfo } from "../api/client";
import AppIcon from "./AppIcon.vue";
const projectUrl = "https://github.com/geekMus/genpac-runner";
const currentVersion = ref(String(packageJson.version));
const updateInfo = ref<UpdateInfo | null>(null);
const dialogOpen = ref(false);
const isCheckingVersion = ref(false);
const refreshFailed = ref(false);
const hasUpdate = computed(() => Boolean(updateInfo.value?.updateAvailable && updateInfo.value.latestVersion));
const latestVersion = computed(() => updateInfo.value?.latestVersion || "暂时未知");
async function loadVersionInfo(forceRefresh = false) {
  if (isCheckingVersion.value) return;
  isCheckingVersion.value = true;
  refreshFailed.value = false;
  if (forceRefresh) updateInfo.value = null;

  try {
    const result = await api.checkForUpdates(forceRefresh);
    if (result.currentVersion) currentVersion.value = result.currentVersion;
    updateInfo.value = result;
    refreshFailed.value = !result.latestVersion;
  } catch {
    refreshFailed.value = true;
  } finally {
    isCheckingVersion.value = false;
  }
}
onMounted(() => { void loadVersionInfo(true); });
</script>
<template>
  <footer class="app-footer" @keydown.esc.stop.prevent="dialogOpen = false">
    <div class="footer-project">
      <a class="github-project-link" :href="projectUrl" target="_blank" rel="noopener noreferrer" aria-label="打开 genpac-runner 的 GitHub 项目" title="GitHub 项目地址">
        <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true"><path fill="currentColor" d="M12 .9a11.1 11.1 0 0 0-3.51 21.63c.55.1.76-.24.76-.53v-2.04c-3.1.68-3.76-1.32-3.76-1.32-.5-1.3-1.24-1.65-1.24-1.65-1.01-.69.08-.68.08-.68 1.12.08 1.71 1.15 1.71 1.15.99 1.7 2.6 1.21 3.23.93.1-.72.39-1.21.7-1.49-2.47-.28-5.07-1.24-5.07-5.5 0-1.22.44-2.22 1.15-3-.12-.28-.5-1.42.11-2.96 0 0 .94-.3 3.05 1.15a10.6 10.6 0 0 1 5.55 0c2.11-1.45 3.05-1.15 3.05-1.15.61 1.54.23 2.68.11 2.96.72.78 1.15 1.78 1.15 3.01 0 4.27-2.6 5.21-5.08 5.49.4.35.75 1.02.75 2.06V22c0 .29.2.64.76.53A11.1 11.1 0 0 0 12 .9Z"/></svg><span>GitHub</span>
      </a>
      <button type="button" class="version-badge" :class="{ 'is-update': hasUpdate }" @click="dialogOpen = true" :aria-label="hasUpdate ? '查看新版本详情' : '查看当前版本信息'">
        <span>v{{ currentVersion }}</span><span v-if="hasUpdate" class="new-badge">New</span>
      </button>
    </div>
    <Transition name="version-dialog">
      <div v-if="dialogOpen" class="dialog-backdrop" @click.self="dialogOpen = false" tabindex="-1">
        <section class="version-dialog" role="dialog" aria-modal="true" aria-labelledby="version-dialog-title">
          <header class="dialog-header"><h2 id="version-dialog-title">项目与版本</h2><button type="button" class="dialog-close" aria-label="关闭弹窗" @click="dialogOpen = false" autofocus><AppIcon name="x" :size="17" /></button></header>
          <div class="version-grid"><div class="version-item"><span>当前版本</span><strong>v{{ currentVersion }}</strong></div><button type="button" class="version-item latest-version-item" :class="{ 'version-new': hasUpdate }" @click="loadVersionInfo(true)" :disabled="isCheckingVersion" :aria-label="isCheckingVersion ? '正在获取最新版本' : '点击获取最新版本'"><span>最新版本 <small>{{ isCheckingVersion ? "获取中…" : "点击刷新" }}</small></span><strong>{{ latestVersion === "暂时未知" ? latestVersion : "v" + latestVersion }}</strong></button></div>
          <div v-if="hasUpdate" class="dialog-update-note" role="status"><span class="dialog-update-dot"></span><div><strong>发现新版本 {{ updateInfo?.latestVersion }}</strong><p>当前运行版本较旧，可前往项目仓库查看最新代码与更新说明。</p></div></div>
          <p v-else-if="isCheckingVersion" class="dialog-status" role="status">正在获取最新版本…</p>
          <p v-else-if="refreshFailed" class="dialog-status" role="status">获取最新版本失败，请稍后点击上方“最新版本”重试。这不会影响 PAC 和管理功能。</p>
          <p v-else-if="updateInfo?.checked" class="dialog-status">你当前使用的已经是最新版本。</p>
          <p v-else class="dialog-status">暂时无法获取远程版本信息；这不会影响 PAC 和管理功能。</p>
          <div class="dialog-actions"><a class="dialog-project-button" :href="updateInfo?.repositoryUrl || projectUrl" target="_blank" rel="noopener noreferrer">
            <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path fill="currentColor" d="M12 .9a11.1 11.1 0 0 0-3.51 21.63c.55.1.76-.24.76-.53v-2.04c-3.1.68-3.76-1.32-3.76-1.32-.5-1.3-1.24-1.65-1.24-1.65-1.01-.69.08-.68.08-.68 1.12.08 1.71 1.15 1.71 1.15.99 1.7 2.6 1.21 3.23.93.1-.72.39-1.21.7-1.49-2.47-.28-5.07-1.24-5.07-5.5 0-1.22.44-2.22 1.15-3-.12-.28-.5-1.42.11-2.96 0 0 .94-.3 3.05 1.15a10.6 10.6 0 0 1 5.55 0c2.11-1.45 3.05-1.15 3.05-1.15.61 1.54.23 2.68.11 2.96.72.78 1.15 1.78 1.15 3.01 0 4.27-2.6 5.21-5.08 5.49.4.35.75 1.02.75 2.06V22c0 .29.2.64.76.53A11.1 11.1 0 0 0 12 .9Z"/></svg>访问 GitHub 项目</a><button type="button" class="dialog-secondary-button" @click="dialogOpen = false">关闭</button></div>
        </section>
      </div>
    </Transition>
  </footer>
</template>
<style scoped>
.app-footer { display:flex; justify-content:flex-start; align-items:center; gap:14px; margin-top:28px; padding:14px 2px 4px; border-top:1px solid var(--line); color:var(--muted); font-size:12px; }
.footer-project { display:flex; align-items:center; gap:12px; }
.github-project-link { display:inline-flex; align-items:center; justify-content:center; gap:7px; min-height:34px; padding:0 11px; border:1px solid var(--line); border-radius:999px; color:var(--text); background:var(--surface); text-decoration:none; font-weight:650; transition:color .15s,border-color .15s,transform .15s; }
.github-project-link:hover { color:var(--accent); border-color:var(--accent); background:var(--surface-2); transform:translateY(-1px); }
.github-project-link:active { color:var(--accent); border-color:var(--accent); background:var(--accent-soft); transform:translateY(0); }
.version-badge { position:relative; display:inline-flex; align-items:center; min-height:31px; padding:0 12px; border:1px solid color-mix(in srgb,var(--accent) 35%,var(--line)); border-radius:999px; background:var(--accent-soft); color:var(--accent); font:inherit; font-size:12px; font-weight:750; font-variant-numeric:tabular-nums; cursor:pointer; transition:transform .15s,box-shadow .15s; }
.version-badge:hover { transform:translateY(-1px); box-shadow:0 3px 10px rgba(30,64,175,.12); }
.version-badge:active { transform:translateY(0); box-shadow:inset 0 1px 2px rgba(30,40,60,.12); }
.version-badge.is-update { border-color:color-mix(in srgb,var(--warn) 55%,var(--line)); background:var(--warn-soft); color:var(--text); }
.new-badge { position:absolute; top:-8px; right:-10px; padding:2px 5px; border:2px solid var(--surface); border-radius:999px; background:var(--warn); color:var(--accent-contrast); font-size:9px; font-weight:800; line-height:1.15; letter-spacing:.02em; }
.dialog-backdrop { position:fixed; inset:0; z-index:1000; display:grid; place-items:center; overflow-y:auto; padding:20px; background:rgba(15,23,42,.48); backdrop-filter:blur(3px); }
.version-dialog { width:min(100%,440px); padding:22px; border:1px solid var(--line); border-radius:18px; background:var(--surface); color:var(--text); box-shadow:0 24px 80px rgba(0,0,0,.24); }
.dialog-header { display:flex; align-items:flex-start; justify-content:space-between; gap:14px; margin-bottom:19px; }
.dialog-header h2 { margin:0; font-size:20px; letter-spacing:-.02em; }
.dialog-close { display:grid; place-items:center; flex:0 0 32px; width:32px; height:32px; border:1px solid var(--line); border-radius:9px; background:var(--surface-2); color:var(--muted); font-size:22px; cursor:pointer; }
.version-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
.version-item { display:flex; flex-direction:column; gap:7px; min-width:0; padding:14px; border:1px solid var(--line); border-radius:12px; background:var(--surface-2); }
.version-item span { color:var(--muted); font-size:11px; }
.version-item strong { overflow-wrap:anywhere; font-size:15px; font-variant-numeric:tabular-nums; }
.latest-version-item { width:100%; border-color:var(--line); color:var(--text); font:inherit; text-align:left; cursor:pointer; transition:border-color .15s,background .15s; }
.latest-version-item:hover:not(:disabled) { border-color:var(--accent); }
.latest-version-item:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
.latest-version-item:disabled {
  cursor:wait;
  color:var(--control-disabled-text);
  border-color:var(--control-disabled-border);
  background:var(--control-disabled-bg);
}
.latest-version-item span small { margin-left:4px; color:var(--accent); font-size:10px; font-weight:650; }
.version-item.version-new { border-color:color-mix(in srgb,var(--warn) 55%,var(--line)); background:var(--warn-soft); color:var(--text); }
.dialog-update-note { display:flex; align-items:flex-start; gap:10px; margin-top:15px; padding:12px; border:1px solid color-mix(in srgb,var(--warn) 55%,var(--line)); border-radius:12px; background:var(--warn-soft); color:var(--text); }
.dialog-update-dot { flex:0 0 8px; width:8px; height:8px; margin-top:5px; border-radius:50%; background:var(--warn); }
.dialog-update-note strong { font-size:13px; }
.dialog-update-note p { margin:4px 0 0; color:var(--muted); font-size:12px; line-height:1.55; }
.dialog-status { margin:15px 0 0; color:var(--muted); font-size:12px; line-height:1.55; }
.dialog-actions { display:flex; flex-wrap:wrap; gap:9px; margin-top:20px; }
.dialog-project-button,.dialog-secondary-button { display:inline-flex; align-items:center; justify-content:center; gap:8px; min-height:39px; padding:0 14px; border:1px solid var(--line); border-radius:10px; background:var(--surface); color:var(--text); font:inherit; font-size:12px; font-weight:650; text-decoration:none; cursor:pointer; }
.dialog-project-button { flex:1; background:var(--accent); border-color:var(--accent); color:var(--accent-contrast); }
.dialog-project-button:hover { background:var(--accent-hover); border-color:var(--accent-hover); color:var(--accent-contrast); filter:none; }
.dialog-project-button:active { background:var(--accent-active); border-color:var(--accent-active); color:var(--accent-contrast); }
.dialog-secondary-button:active { background:var(--accent-soft); color:var(--accent); }
.dialog-secondary-button:hover { border-color:var(--accent); color:var(--accent); }
.version-dialog-enter-active,.version-dialog-leave-active { transition:opacity .16s ease,transform .16s ease; }
.version-dialog-enter-active .version-dialog,.version-dialog-leave-active .version-dialog { transition:transform .16s ease; }
.version-dialog-enter-from,.version-dialog-leave-to { opacity:0; }
.version-dialog-enter-from .version-dialog,.version-dialog-leave-to .version-dialog { transform:translateY(7px) scale(.99); }
@media(max-width:560px) { .app-footer { align-items:flex-start; flex-direction:column; margin-top:22px; padding-top:12px; } .version-dialog { padding:18px; } }
</style>
