<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import { api, type WorkflowRun } from "../api/client";
import AdminLayout from "../components/AdminLayout.vue";
import AppIcon from "../components/AppIcon.vue";
import AppFooter from "../components/AppFooter.vue";

const router = useRouter();
const loading = ref(true);
const refreshing = ref(false);
const error = ref("");
const current = ref<WorkflowRun | null>(null);
const runs = ref<WorkflowRun[]>([]);
let pollHandle: ReturnType<typeof setInterval> | undefined;

const active = computed(() => Boolean(current.value));
const statusNames: Record<string, string> = {
  pending: "等待执行",
  running: "执行中",
  succeeded: "成功",
  failed: "失败",
};
const sourceNames: Record<string, string> = {
  startup: "服务启动",
  scheduled: "定时任务",
  manual: "手动生成",
  "save-and-generate": "保存并生成",
};
const statusLabel = (status: string) => statusNames[status] ?? status;
const sourceLabel = (source: string) => sourceNames[source] ?? source;
const modeLabel = (mode: string) => mode === "remote" ? "远程规则" : mode === "custom" ? "自定义规则" : mode || "—";
const durationLabel = (run: WorkflowRun) => {
  const ms = run.duration_ms ?? (run.started_at ? Date.now() - new Date(run.started_at).getTime() : null);
  if (ms === null) return "—";
  if (ms < 1000) return ms + " ms";
  if (ms < 60000) return (ms / 1000).toFixed(1) + " 秒";
  return Math.floor(ms / 60000) + " 分 " + Math.floor((ms % 60000) / 1000) + " 秒";
};
const dateLabel = (value: string | null) => value ? new Date(value).toLocaleString() : "—";

async function load(silent = false) {
  if (!silent) refreshing.value = true;
  error.value = "";
  try {
    const session = await api.session();
    if (!session.loggedIn) {
      await router.replace("/admin/login");
      return;
    }
    const result = await api.workflows(100);
    current.value = result.current;
    runs.value = result.runs;
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : String(caught);
  } finally {
    loading.value = false;
    refreshing.value = false;
  }
}
onMounted(() => {
  void load();
  pollHandle = setInterval(() => { void load(true); }, 3000);
});
onUnmounted(() => { if (pollHandle) clearInterval(pollHandle); });
</script>

<template>
  <AdminLayout active="workflow" title="工作流" subtitle="查看 PAC 生成任务的实时状态、执行阶段与历史记录。">
    <template #actions>
      <button class="workflow-button secondary" type="button" :disabled="refreshing" @click="load()">
        <AppIcon :name="refreshing ? 'loader-circle' : 'refresh-cw'" :size="15" :class="{ spinning: refreshing }" />
        {{ refreshing ? "刷新中…" : "刷新" }}
      </button>
      <RouterLink class="workflow-button primary" to="/admin/settings">配置设置</RouterLink>
    </template>

    <div class="workflow-page">
      <div v-if="error" class="workflow-alert error" role="alert">
        <strong>读取工作流失败</strong>
        <span>{{ error }}</span>
        <button type="button" @click="load()">重试</button>
      </div>

      <section class="workflow-current panel">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">CURRENT TASK</p>
            <h2>当前工作流</h2>
          </div>
          <span class="status-pill" :class="active ? 'running' : 'idle'">{{ active ? statusLabel(current!.status) : "空闲" }}</span>
        </div>
        <template v-if="current">
          <div class="current-main">
            <div class="current-icon"><AppIcon :name="current.status === 'failed' ? 'circle-alert' : 'workflow'" :size="23" /></div>
            <div class="current-copy">
              <strong>{{ sourceLabel(current.source) }}</strong>
              <span>{{ current.stage || "正在准备任务" }}</span>
            </div>
          </div>
          <p class="current-message">{{ current.message }}</p>
          <div class="current-meta">
            <div><span>任务编号</span><strong>#{{ current.id }}</strong></div>
            <div><span>生成模式</span><strong>{{ modeLabel(current.mode) }}</strong></div>
            <div><span>开始时间</span><strong>{{ dateLabel(current.started_at || current.created_at) }}</strong></div>
            <div><span>已运行</span><strong>{{ durationLabel(current) }}</strong></div>
          </div>
          <div v-if="current.error" class="workflow-error-detail"><strong>错误详情</strong><pre>{{ current.error }}</pre></div>
        </template>
        <div v-else class="empty-current">
          <AppIcon name="check-circle-2" :size="26" />
          <strong>{{ loading ? "正在读取工作流状态…" : "当前没有正在执行的工作流" }}</strong>
          <span>手动生成、保存并生成、定时任务和服务启动时的 PAC 生成都会记录在这里。</span>
          <RouterLink v-if="!loading" to="/admin/settings">前往配置并生成 PAC</RouterLink>
        </div>
      </section>

      <section class="workflow-history panel">
        <div class="panel-heading">
          <div><p class="eyebrow">HISTORY</p><h2>执行历史</h2><p class="panel-subtitle">最近 {{ runs.length }} 条任务记录；历史记录与生成日志分开保存。</p></div>
          <span class="count-pill">{{ runs.length }} 条</span>
        </div>
        <div class="table-scroll">
          <table>
            <thead><tr><th>任务</th><th>状态</th><th>来源</th><th>阶段 / 结果</th><th>开始时间</th><th>耗时</th></tr></thead>
            <tbody>
              <tr v-for="run in runs" :key="run.id">
                <td class="task-id">#{{ run.id }}</td>
                <td><span class="status-pill" :class="run.status">{{ statusLabel(run.status) }}</span></td>
                <td>{{ sourceLabel(run.source) }}</td>
                <td class="result-cell">
                  <strong>{{ run.stage || "—" }}</strong>
                  <span>{{ run.error || run.message || "—" }}</span>
                </td>
                <td class="date-cell">{{ dateLabel(run.started_at || run.created_at) }}</td>
                <td class="duration-cell">{{ durationLabel(run) }}</td>
              </tr>
              <tr v-if="!loading && !runs.length"><td colspan="6" class="empty-row">暂无工作流历史。启动服务或执行一次 PAC 生成后，这里会显示完整记录。</td></tr>
              <tr v-if="loading && !runs.length"><td colspan="6" class="empty-row">正在加载历史记录…</td></tr>
            </tbody>
          </table>
        </div>
      </section>
      <AppFooter />
    </div>
  </AdminLayout>
</template>

<style scoped>
.workflow-page { display:grid; gap:18px; }
.panel { min-width:0; padding:22px; border:1px solid var(--line); border-radius:14px; background:var(--surface); box-shadow:var(--shadow-sm, 0 4px 18px rgba(0,0,0,.03)); }
.panel-heading { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; margin-bottom:18px; }
.panel-heading h2 { margin:0; color:var(--text); font-size:19px; }
.eyebrow { margin:0 0 6px; color:var(--muted); font-size:10px; font-weight:800; letter-spacing:.13em; }
.panel-subtitle { margin:7px 0 0; color:var(--muted); font-size:12px; }
.workflow-button { display:inline-flex; align-items:center; justify-content:center; gap:7px; min-height:36px; padding:0 12px; border:1px solid var(--line); border-radius:8px; color:var(--text); text-decoration:none; font:inherit; font-size:12px; font-weight:700; cursor:pointer; }
.workflow-button.secondary { background:var(--surface); }
.workflow-button.primary { background:var(--accent); color:var(--accent-contrast,white); border-color:var(--accent); }
.workflow-button:disabled { opacity:.55; cursor:not-allowed; }
.status-pill,.count-pill { display:inline-flex; align-items:center; justify-content:center; padding:5px 9px; border:1px solid var(--line); border-radius:999px; background:var(--surface-2); color:var(--muted); font-size:11px; font-weight:800; white-space:nowrap; }
.status-pill.running,.status-pill.pending { color:var(--accent); border-color:color-mix(in srgb,var(--accent) 35%,var(--line)); }
.status-pill.succeeded { color:var(--green); border-color:color-mix(in srgb,var(--green) 35%,var(--line)); }
.status-pill.failed { color:var(--red); border-color:color-mix(in srgb,var(--red) 35%,var(--line)); }
.current-main { display:flex; align-items:center; gap:12px; }
.current-icon { display:grid; place-items:center; width:46px; height:46px; border-radius:12px; background:var(--accent-soft); color:var(--accent); }
.current-copy { display:grid; gap:5px; min-width:0; }
.current-copy strong { color:var(--text); font-size:15px; }
.current-copy span,.current-message { color:var(--muted); font-size:12px; overflow-wrap:anywhere; }
.current-message { margin:16px 0; }
.current-meta { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; padding-top:16px; border-top:1px solid var(--line); }
.current-meta div { display:grid; gap:6px; min-width:0; }
.current-meta span { color:var(--muted); font-size:11px; }
.current-meta strong { color:var(--text); font-size:12px; overflow-wrap:anywhere; }
.empty-current { display:grid; justify-items:center; gap:10px; padding:28px 10px; color:var(--muted); text-align:center; }
.empty-current strong { color:var(--text); font-size:14px; }
.empty-current span { max-width:500px; font-size:12px; line-height:1.6; }
.empty-current a { margin-top:3px; color:var(--accent); font-size:12px; font-weight:700; }
.table-scroll { width:100%; overflow-x:auto; }
table { width:100%; border-collapse:collapse; text-align:left; font-size:12px; }
th { padding:10px 12px; color:var(--muted); background:var(--surface-2); font-size:10px; white-space:nowrap; }
td { padding:13px 12px; border-bottom:1px solid var(--line); color:var(--text); vertical-align:top; }
.task-id,.date-cell,.duration-cell { white-space:nowrap; font-variant-numeric:tabular-nums; }
.result-cell { min-width:190px; max-width:380px; }
.result-cell strong,.result-cell span { display:block; overflow-wrap:anywhere; }
.result-cell span { margin-top:5px; color:var(--muted); font-size:11px; line-height:1.5; }
.empty-row { padding:30px 12px; color:var(--muted); text-align:center; }
.workflow-error-detail { margin-top:16px; padding:13px; border:1px solid color-mix(in srgb,var(--red) 30%,var(--line)); border-radius:8px; background:var(--red-soft); color:var(--red); }
.workflow-error-detail pre { margin:8px 0 0; font:inherit; font-size:12px; white-space:pre-wrap; overflow-wrap:anywhere; }
.workflow-alert { display:grid; gap:6px; padding:14px; border:1px solid var(--line); border-radius:10px; font-size:12px; }
.workflow-alert.error { border-color:var(--red); color:var(--red); }
.workflow-alert button { justify-self:start; color:inherit; }
.spinning { animation:spin .9s linear infinite; }
@keyframes spin { to { transform:rotate(360deg); } }
@media(max-width:700px) { .panel { padding:15px; } .current-meta { grid-template-columns:repeat(2,minmax(0,1fr)); } .panel-heading h2 { font-size:17px; } }
</style>
