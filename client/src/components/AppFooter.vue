<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import packageJson from "../../../package.json";
import { api, type UpdateInfo } from "../api/client";
const projectUrl = "https://github.com/geekMus/genpac-runner";
const currentVersion = ref(String(packageJson.version));
const updateInfo = ref<UpdateInfo | null>(null);
const dialogOpen = ref(false);
const hasUpdate = computed(() => Boolean(updateInfo.value?.updateAvailable && updateInfo.value.latestVersion));
const latestVersion = computed(() => updateInfo.value?.latestVersion || "暂时未知");
async function readLatestVersionDirectly(): Promise<string | null> {
  const sources = [
    "https://raw.githubusercontent.com/geekMus/genpac-runner/main/package.json",
    "https://cdn.jsdelivr.net/gh/geekMus/genpac-runner@main/package.json",
  ];
  for (const url of sources) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(7000), cache: "no-store" });
      if (!response.ok) continue;
      const data = await response.json() as { version?: unknown };
      if (typeof data.version === "string" && /^\\d{4}\\.\\d{2}\\.\\d{2}(?:-r[1-9]\\d*)?$/.test(data.version)) return data.version;
    } catch { /* 尝试下一个镜像源。 */ }
  }
  return null;
}
async function loadVersionInfo() {
  try {
    updateInfo.value = await api.checkForUpdates();
    if (updateInfo.value.currentVersion) currentVersion.value = updateInfo.value.currentVersion;
  } catch { /* 服务端版本检查不可用时尝试浏览器直连。 */ }
  if (!updateInfo.value?.latestVersion) {
    const latest = await readLatestVersionDirectly();
    if (latest) {
      const current = currentVersion.value;
      updateInfo.value = {
        currentVersion: current,
        latestVersion: latest,
        updateAvailable: latest > current,
        checked: true,
        repositoryUrl: projectUrl,
      };
    }
  }
}
onMounted(() => { void loadVersionInfo(); });
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
    <p class="footer-caption">genpac-runner · 项目与版本信息</p>
    <Transition name="version-dialog">
      <div v-if="dialogOpen" class="dialog-backdrop" @click.self="dialogOpen = false" tabindex="-1">
        <section class="version-dialog" role="dialog" aria-modal="true" aria-labelledby="version-dialog-title">
          <header class="dialog-header"><div><p class="dialog-kicker">PROJECT INFORMATION</p><h2 id="version-dialog-title">项目与版本</h2></div><button type="button" class="dialog-close" aria-label="关闭弹窗" @click="dialogOpen = false" autofocus>×</button></header>
          <div class="version-grid"><div class="version-item"><span>当前版本</span><strong>v{{ currentVersion }}</strong></div><div class="version-item" :class="{ 'version-new': hasUpdate }"><span>最新版本</span><strong>{{ latestVersion === "暂时未知" ? latestVersion : "v" + latestVersion }}</strong></div></div>
          <div v-if="hasUpdate" class="dialog-update-note" role="status"><span class="dialog-update-dot"></span><div><strong>发现新版本 {{ updateInfo?.latestVersion }}</strong><p>当前运行版本较旧，可前往项目仓库查看最新代码与更新说明。</p></div></div>
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
.app-footer { display:flex; justify-content:space-between; align-items:center; gap:14px; margin-top:36px; padding:17px 2px 5px; border-top:1px solid var(--line); color:var(--muted); font-size:12px; }
.footer-project { display:flex; align-items:center; gap:12px; }
.github-project-link { display:inline-flex; align-items:center; justify-content:center; gap:7px; min-height:34px; padding:0 11px; border:1px solid var(--line); border-radius:999px; color:var(--text); background:var(--surface); text-decoration:none; font-weight:650; transition:color .15s,border-color .15s,transform .15s; }
.github-project-link:hover { color:var(--accent); border-color:var(--accent); transform:translateY(-1px); }
.version-badge { position:relative; display:inline-flex; align-items:center; min-height:31px; padding:0 12px; border:1px solid color-mix(in srgb,var(--accent) 35%,var(--line)); border-radius:999px; background:var(--accent-soft); color:var(--accent); font:inherit; font-size:12px; font-weight:750; font-variant-numeric:tabular-nums; cursor:pointer; transition:transform .15s,box-shadow .15s; }
.version-badge:hover { transform:translateY(-1px); box-shadow:0 3px 10px rgba(30,64,175,.12); }
.version-badge.is-update { border-color:#fdba74; background:#fff7ed; color:#c2410c; }
.new-badge { position:absolute; top:-8px; right:-10px; padding:2px 5px; border:2px solid var(--surface); border-radius:999px; background:#f97316; color:white; font-size:9px; font-weight:800; line-height:1.15; letter-spacing:.02em; }
.footer-caption { margin:0; text-align:right; color:var(--muted); font-size:11px; }
.dialog-backdrop { position:fixed; inset:0; z-index:1000; display:grid; place-items:center; overflow-y:auto; padding:20px; background:rgba(15,23,42,.48); backdrop-filter:blur(3px); }
.version-dialog { width:min(100%,440px); padding:22px; border:1px solid var(--line); border-radius:18px; background:var(--surface); color:var(--text); box-shadow:0 24px 80px rgba(0,0,0,.24); }
.dialog-header { display:flex; align-items:flex-start; justify-content:space-between; gap:14px; margin-bottom:19px; }
.dialog-kicker { margin:0 0 5px; color:var(--muted); font-size:10px; font-weight:750; letter-spacing:.14em; }
.dialog-header h2 { margin:0; font-size:20px; letter-spacing:-.02em; }
.dialog-close { display:grid; place-items:center; width:32px; height:32px; border:1px solid var(--line); border-radius:9px; background:var(--surface-2); color:var(--muted); font-size:22px; cursor:pointer; }
.version-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
.version-item { display:flex; flex-direction:column; gap:7px; min-width:0; padding:14px; border:1px solid var(--line); border-radius:12px; background:var(--surface-2); }
.version-item span { color:var(--muted); font-size:11px; }
.version-item strong { overflow-wrap:anywhere; font-size:15px; font-variant-numeric:tabular-nums; }
.version-item.version-new { border-color:#fdba74; background:#fff7ed; color:#9a3412; }
.dialog-update-note { display:flex; align-items:flex-start; gap:10px; margin-top:15px; padding:12px; border:1px solid #fdba74; border-radius:12px; background:#fff7ed; color:#9a3412; }
.dialog-update-dot { flex:0 0 8px; width:8px; height:8px; margin-top:5px; border-radius:50%; background:#f97316; }
.dialog-update-note strong { font-size:13px; }
.dialog-update-note p { margin:4px 0 0; color:#9a3412; font-size:12px; line-height:1.55; }
.dialog-status { margin:15px 0 0; color:var(--muted); font-size:12px; line-height:1.55; }
.dialog-actions { display:flex; flex-wrap:wrap; gap:9px; margin-top:20px; }
.dialog-project-button,.dialog-secondary-button { display:inline-flex; align-items:center; justify-content:center; gap:8px; min-height:39px; padding:0 14px; border:1px solid var(--line); border-radius:10px; background:var(--surface); color:var(--text); font:inherit; font-size:12px; font-weight:650; text-decoration:none; cursor:pointer; }
.dialog-project-button { flex:1; background:var(--accent); border-color:var(--accent); color:white; }
.dialog-project-button:hover { filter:brightness(1.05); }
.dialog-secondary-button:hover { border-color:var(--accent); color:var(--accent); }
.version-dialog-enter-active,.version-dialog-leave-active { transition:opacity .16s ease,transform .16s ease; }
.version-dialog-enter-active .version-dialog,.version-dialog-leave-active .version-dialog { transition:transform .16s ease; }
.version-dialog-enter-from,.version-dialog-leave-to { opacity:0; }
.version-dialog-enter-from .version-dialog,.version-dialog-leave-to .version-dialog { transform:translateY(7px) scale(.99); }
@media(max-width:560px) { .app-footer { align-items:flex-start; flex-direction:column; } .footer-caption { text-align:left; } .version-dialog { padding:18px; } }
</style>
