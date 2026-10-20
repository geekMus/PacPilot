<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api, type WorkflowDetail, type WorkflowStage } from "../api/client";
import AdminLayout from "../components/AdminLayout.vue";
import AppIcon from "../components/AppIcon.vue";
import AppFooter from "../components/AppFooter.vue";
import { useToast } from "../composables/useToast";
const route=useRoute(),router=useRouter(),{notify}=useToast();
const detail=ref<WorkflowDetail|null>(null),loading=ref(true),error=ref(""),deleting=ref(false),confirmingDelete=ref(false),cancelling=ref(false),confirmingCancel=ref(false);
let previousStatus:string|null=null;
let pollHandle:ReturnType<typeof setInterval>|undefined;
let requestInFlight=false;
const isActiveStatus=(status:string|undefined)=>status==="pending"||status==="running";
function stopPolling(){if(pollHandle)clearInterval(pollHandle);pollHandle=undefined;}
function syncPolling(){if(isActiveStatus(detail.value?.run.status)){if(!pollHandle)pollHandle=setInterval(()=>{if(isActiveStatus(detail.value?.run.status))void load();else stopPolling();},3000);}else stopPolling();}
const statuses:Record<string,string>={pending:"等待执行",running:"执行中",succeeded:"成功",failed:"失败",cancelled:"已取消",skipped:"已跳过"};
const sources:Record<string,string>={startup:"服务启动",scheduled:"定时任务",manual:"手动生成","save-and-generate":"保存并生成"};
const label=(v:string)=>statuses[v]||v,sourceLabel=(v:string)=>sources[v]||v;
const dateLabel=(v:string|null)=>v?new Date(v).toLocaleString():"—";
const selectedStage=ref<WorkflowStage|null>(null);
const stageDetailDialog=ref<HTMLDialogElement|null>(null);
const stageDetailCopyState=ref("");
function formatStageDetail(raw:string|undefined|null):string{
  if(!raw||!String(raw).trim())return"（无详细记录）";
  try{
    return JSON.stringify(JSON.parse(raw),null,2);
  }catch{
    return String(raw);
  }
}
async function openStageDetail(stage:WorkflowStage):Promise<void>{
  selectedStage.value=stage;
  stageDetailCopyState.value="";
  await nextTick();
  if(stageDetailDialog.value&&!stageDetailDialog.value.open)stageDetailDialog.value.showModal();
}
function closeStageDetail():void{if(stageDetailDialog.value?.open)stageDetailDialog.value.close();}
function onStageDetailClose():void{selectedStage.value=null;stageDetailCopyState.value="";}
function handleStageDetailBackdrop(event:MouseEvent):void{if(event.target===stageDetailDialog.value)closeStageDetail();}
async function copyStageDetail():Promise<void>{
  const stage=selectedStage.value;if(!stage)return;
  const text=[
    `阶段：${stage.name}`,
    `键：${stage.stage_key}`,
    `状态：${label(stage.status)}`,
    `说明：${stage.message||"—"}`,
    `错误：${stage.error||"—"}`,
    `开始：${dateLabel(stage.started_at)}`,
    `结束：${dateLabel(stage.finished_at)}`,
    `耗时：${stage.duration_ms==null?"—":stage.duration_ms+" ms"}`,
    "",
    "详情：",
    formatStageDetail(stage.detail),
  ].join("\n");
  try{await navigator.clipboard.writeText(text);stageDetailCopyState.value="已复制到剪贴板";}
  catch{stageDetailCopyState.value="当前环境无法自动复制，请选中文本后手动复制。";}
}

function durationLabel(s:WorkflowStage){const ms=s.duration_ms??(s.started_at?Date.now()-new Date(s.started_at).getTime():null);if(ms===null)return"—";return ms<1000?ms+" ms":ms<60000?(ms/1000).toFixed(1)+" 秒":Math.floor(ms/60000)+" 分 "+Math.floor(ms%60000/1000)+" 秒";}
async function load(){if(requestInFlight)return;requestInFlight=true;const requestedId=Number(route.params.id);try{const session=await api.session();if(!session.loggedIn){stopPolling();await router.replace("/admin/login");return;}if(session.mustChangePassword){stopPolling();await router.replace("/admin/settings");return;}const next=await api.workflowDetail(requestedId);if(requestedId!==Number(route.params.id))return;if(previousStatus!==null&&isActiveStatus(previousStatus)&&(next.run.status==="succeeded"||next.run.status==="failed"||next.run.status==="cancelled")){const message=next.run.status==="succeeded"?`工作流 #${next.run.id} 已执行完成`:next.run.status==="failed"?`工作流 #${next.run.id} 执行失败：${next.run.error||next.run.message||"请查看执行详情"}`:`工作流 #${next.run.id} 已取消排队`;notify(message,next.run.status==="succeeded"?"success":next.run.status==="failed"?"error":"warning",6500);}previousStatus=next.run.status;detail.value=next;error.value="";}catch(e){if(requestedId===Number(route.params.id))error.value=e instanceof Error?e.message:String(e);}finally{loading.value=false;requestInFlight=false;if(requestedId!==Number(route.params.id)){void load();return;}syncPolling();}}
async function deleteRun(){if(!detail.value||deleting.value||!confirmingDelete.value)return;const run=detail.value.run;if(run.status==="running"||run.status==="pending"){notify("等待中或执行中的工作流不能删除。","warning");return;}deleting.value=true;try{await api.deleteWorkflow(run.id);notify(`工作流执行记录 #${run.id} 已删除`,"success");await router.replace("/admin/workflows");}catch(e){notify(e instanceof Error?e.message:String(e),"error");}finally{deleting.value=false;confirmingDelete.value=false;}}
async function cancelRun(){if(!detail.value||cancelling.value||detail.value.run.status!=="pending"||!confirmingCancel.value)return;cancelling.value=true;try{await api.cancelWorkflow(detail.value.run.id);confirmingCancel.value=false;await load();}catch(e){notify(e instanceof Error?e.message:String(e),"error");}finally{cancelling.value=false;}}
watch(()=>route.params.id,()=>{previousStatus=null;detail.value=null;loading.value=true;error.value="";confirmingDelete.value=false;confirmingCancel.value=false;void load();});
onMounted(()=>{void load();});onUnmounted(stopPolling);
</script>
<template>
<AdminLayout active="workflow" title="工作流详情" subtitle="查看本次执行的整体状态、各阶段结果与失败原因。">

<div class="detail-page">
<div v-if="error" class="error-panel" role="alert"><strong>读取执行详情失败</strong><span>{{error}}</span><button type="button" @click="load()">重试</button></div>
<section v-if="detail" class="detail-panel"><div class="panel-heading"><div><p class="eyebrow">EXECUTION #{{detail.run.id}}</p><h2>PAC 生成工作流</h2><p class="muted">固定工作流标识：pac-generation</p></div><span class="status" :class="detail.run.status"><AppIcon v-if="detail.run.status==='running'||detail.run.status==='pending'" :name="detail.run.status==='pending'?'clock':'loader-circle'" :size="13" :class="{spinning:detail.run.status==='running'}"/>{{label(detail.run.status)}}</span></div>
<div class="meta-grid"><div><span>执行编号</span><strong>#{{detail.run.id}}</strong></div><div><span>触发方式</span><strong>{{sourceLabel(detail.run.source)}}</strong></div><div><span>生成模式</span><strong>{{detail.run.mode==="remote"?"远程规则":"自定义规则"}}</strong></div><div><span>开始时间</span><strong>{{dateLabel(detail.run.started_at||detail.run.created_at)}}</strong></div><div><span>结束时间</span><strong>{{dateLabel(detail.run.finished_at)}}</strong></div><div><span>总耗时</span><strong>{{detail.run.duration_ms==null?(detail.run.status==="running"?"执行中":"—"):detail.run.duration_ms+" ms"}}</strong></div></div>
<div class="result-message"><strong>执行结果</strong><p>{{detail.run.message||"暂无结果信息"}}</p></div><div v-if="detail.run.error" class="failure-message"><strong><AppIcon name="circle-alert" :size="16"/> 失败原因</strong><pre>{{detail.run.error}}</pre></div></section>
<section v-if="detail" class="detail-panel"><div class="panel-heading"><div><p class="eyebrow">STAGE TIMELINE</p><h2>阶段执行情况</h2><p class="muted">阶段记录由服务端持久化，刷新页面不会丢失。点击阶段可查看请求与配置等详细信息。</p></div><span class="muted">{{detail.stages.length}} 个阶段</span></div>
<ol class="stage-list"><li v-for="(stage,index) in detail.stages" :key="stage.id" class="stage-item is-clickable" title="点击查看阶段详情" @click="openStageDetail(stage)"><span class="stage-marker" :class="stage.status"><AppIcon :name="stage.status==='succeeded'?'circle-check':stage.status==='failed'?'circle-x':stage.status==='running'?'loader-circle':stage.status==='pending'?'clock':stage.status==='skipped'?'circle':'circle-help'" :size="16"  :class="{spinning:stage.status==='running'}"/></span><div class="stage-body"><div class="stage-heading"><div><span class="stage-number">阶段 {{index+1}}</span><h3>{{stage.name}}</h3></div><span class="status" :class="stage.status">{{label(stage.status)}}</span></div><p>{{stage.message||"暂无阶段说明"}}</p><div class="stage-meta"><span>开始：{{dateLabel(stage.started_at)}}</span><span>结束：{{dateLabel(stage.finished_at)}}</span><span>耗时：{{durationLabel(stage)}}</span></div><pre v-if="stage.error" class="stage-error">{{stage.error}}</pre></div></li><li v-if="!detail.stages.length" class="no-stages"><AppIcon name="info" :size="17"/> 此执行记录没有阶段数据（例如升级前创建的历史任务）。</li></ol></section>
<div v-else-if="loading" class="detail-panel loading" aria-live="polite"><AppIcon name="loader-circle" :size="20" class="spinning"/> 正在加载执行详情…</div>
<dialog v-if="selectedStage" ref="stageDetailDialog" class="stage-detail-dialog" aria-label="工作流阶段详情" @click="handleStageDetailBackdrop" @close="onStageDetailClose">
<header class="stage-detail-header"><div><p class="stage-detail-kicker">STAGE · {{selectedStage.stage_key}}</p><h2>{{selectedStage.name}}</h2></div>
<div class="stage-detail-actions"><button class="stage-detail-btn" type="button" @click="copyStageDetail">复制</button><button class="stage-detail-btn" type="button" @click="closeStageDetail">关闭</button></div></header>
<p v-if="stageDetailCopyState" class="stage-detail-copy" role="status">{{stageDetailCopyState}}</p>
<div class="stage-detail-grid">
<div><span>状态</span><strong>{{label(selectedStage.status)}}</strong></div>
<div><span>耗时</span><strong>{{selectedStage.duration_ms==null?"—":selectedStage.duration_ms+" ms"}}</strong></div>
<div><span>开始</span><strong>{{dateLabel(selectedStage.started_at)}}</strong></div>
<div><span>结束</span><strong>{{dateLabel(selectedStage.finished_at)}}</strong></div>
</div>
<div class="stage-detail-block"><span>说明</span><pre>{{selectedStage.message||"（无）"}}</pre></div>
<div v-if="selectedStage.error" class="stage-detail-block"><span>错误</span><pre>{{selectedStage.error}}</pre></div>
<div class="stage-detail-block"><span>详细信息</span><pre>{{formatStageDetail(selectedStage.detail)}}</pre></div>
</dialog>
<div v-if="detail" class="detail-page-actions">
  <RouterLink class="back-link" to="/admin/workflows"><AppIcon name="arrow-left" :size="16"/> 返回工作流记录</RouterLink>
  <div class="detail-action-group">
    <div v-if="detail.run.status === 'pending'" class="detail-confirm-anchor">
      <button class="cancel-button" type="button" :disabled="cancelling" :title="cancelling ? '正在取消工作流，请稍候' : '取消当前等待中的工作流'" @click="confirmingCancel=!confirmingCancel;confirmingDelete=false"><AppIcon name="x" :size="15"/> 取消排队</button>
      <div v-if="confirmingCancel" class="detail-confirm-popover cancel-confirm-popover" role="group"><strong>取消这条等待任务？</strong><span>取消后任务不会继续执行，但记录仍会保留。</span><div><button type="button" class="confirm-cancel" @click="confirmingCancel=false">返回</button><button type="button" class="confirm-cancel-action" :disabled="cancelling" :title="cancelling ? '正在取消工作流，请稍候' : '确认取消工作流'" @click="cancelRun">{{cancelling?"取消中…":"确认取消"}}</button></div></div>
    </div>
    <div v-if="detail.run.status !== 'running' && detail.run.status !== 'pending'" class="detail-confirm-anchor">
      <button class="delete-button" type="button" :disabled="deleting" :title="deleting ? '正在删除工作流记录，请稍候' : '删除这条工作流执行记录'" @click="confirmingDelete=!confirmingDelete;confirmingCancel=false"><AppIcon name="trash-2" :size="15"/> 删除记录</button>
      <div v-if="confirmingDelete" class="detail-confirm-popover" role="group"><strong>删除这条记录？</strong><span>阶段详情也会一并删除，此操作不可撤销。</span><div><button type="button" class="confirm-cancel" @click="confirmingDelete=false">取消</button><button type="button" class="confirm-delete" :disabled="deleting" :title="deleting ? '正在删除工作流记录，请稍候' : '确认删除工作流记录'" @click="deleteRun">{{deleting?"删除中…":"确认删除"}}</button></div></div>
    </div>
  </div>
</div><AppFooter/></div>
</AdminLayout>
</template>
<style scoped>
.detail-page{display:grid;gap:18px}.detail-panel{min-width:0;padding:22px;border:1px solid var(--line);border-radius:14px;background:var(--surface);box-shadow:var(--shadow-sm,0 4px 18px #00000008)}.panel-heading{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:20px}.panel-heading h2{margin:0;color:var(--text);font-size:19px}.eyebrow{margin:0 0 6px;color:var(--muted);font-size:10px;font-weight:800;letter-spacing:.13em}.muted{color:var(--muted);font-size:12px}.status{display:inline-flex;padding:5px 9px;border:1px solid var(--line);border-radius:999px;color:var(--muted);font-size:11px;font-weight:800;white-space:nowrap}.status.running,.status.pending{color:var(--accent)}.status.succeeded{color:var(--green)}.status.failed{color:var(--red)}.meta-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:15px;padding:15px 0;border-block:1px solid var(--line)}.meta-grid div{display:grid;gap:6px;min-width:0}.meta-grid span{color:var(--muted);font-size:11px}.meta-grid strong{color:var(--text);font-size:12px;overflow-wrap:anywhere}.result-message{padding:15px 0}.result-message strong{font-size:13px}.result-message p{margin:7px 0 0;color:var(--muted);font-size:13px;overflow-wrap:anywhere}.failure-message,.stage-error{padding:13px;border:1px solid color-mix(in srgb,var(--red) 30%,var(--line));border-radius:8px;background:var(--red-soft);color:var(--red)}.failure-message strong{display:flex;align-items:center;gap:7px}.failure-message pre,.stage-error{margin:8px 0 0;font:inherit;font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere}.stage-list{list-style:none;margin:0;padding:0}.stage-item{display:flex;gap:13px;position:relative;padding-bottom:24px}.stage-item:not(:last-child):before{content:"";position:absolute;left:15px;top:32px;bottom:0;width:1px;background:var(--line)}.stage-marker{z-index:1;display:grid;place-items:center;flex:0 0 32px;width:32px;height:32px;border:1px solid var(--line);border-radius:50%;background:var(--surface-2);color:var(--muted)}.stage-marker.succeeded{color:var(--green)}.stage-marker.failed{color:var(--red)}.stage-marker.running{color:var(--accent)}.stage-body{flex:1;min-width:0;padding:4px 0}.stage-heading{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.stage-heading h3{margin:3px 0 0;color:var(--text);font-size:14px}.stage-number{color:var(--muted);font-size:10px}.stage-body p{margin:9px 0;color:var(--muted);font-size:12px;line-height:1.6;overflow-wrap:anywhere}.stage-meta{display:flex;flex-wrap:wrap;gap:8px 18px;color:var(--muted);font-size:11px}.no-stages,.loading{display:flex;align-items:center;gap:10px;padding:20px;color:var(--muted);font-size:13px}.error-panel{display:grid;gap:8px;padding:14px;border:1px solid var(--red);border-radius:10px;color:var(--red);font-size:12px} .detail-page-actions{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:4px 2px}.detail-action-group{display:flex;align-items:center;gap:9px;flex-wrap:wrap}.cancel-confirm-popover{border-color:color-mix(in srgb,var(--amber, #d97706) 35%,var(--line))}.detail-confirm-popover .confirm-cancel-action{background:var(--amber-soft,#fff3dc);border-color:color-mix(in srgb,var(--amber,#d97706) 40%,var(--line));color:var(--amber,#b45309)}.back-link,.delete-button,.cancel-button{display:inline-flex;align-items:center;gap:7px;min-height:36px;padding:0 12px;border:1px solid var(--line);border-radius:8px;color:var(--text);text-decoration:none;font-size:12px;font-weight:700;background:var(--surface);cursor:pointer}.delete-button{color:var(--red)}.cancel-button{color:var(--muted)}.delete-button:disabled,.cancel-button:disabled{opacity:.55;cursor:not-allowed}.detail-confirm-anchor{position:relative}.detail-confirm-popover{position:absolute;z-index:30;right:0;top:calc(100% + 7px);width:245px;padding:13px;border:1px solid var(--line);border-radius:10px;background:var(--surface);box-shadow:0 10px 30px rgba(0,0,0,.14)}.detail-confirm-popover strong,.detail-confirm-popover span{display:block}.detail-confirm-popover strong{font-size:12px;color:var(--text)}.detail-confirm-popover span{margin-top:5px;font-size:11px;line-height:1.5;color:var(--muted)}.detail-confirm-popover>div{display:flex;justify-content:flex-end;gap:7px;margin-top:12px}.detail-confirm-popover button{min-height:29px;padding:0 9px;border:1px solid var(--line);border-radius:6px;background:var(--surface-2);color:var(--text);font:inherit;font-size:11px;cursor:pointer}.detail-confirm-popover .confirm-delete{background:var(--red);border-color:var(--red);color:white}.status{gap:5px}.spinning{animation:spin .9s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.spinning{animation-duration:.01ms;animation-iteration-count:1}}@media(max-width:650px){.detail-panel{padding:15px}.meta-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.stage-heading{align-items:flex-start}.detail-page-actions{position:sticky;bottom:8px;z-index:10;padding:10px;border:1px solid var(--line);border-radius:12px;background:var(--surface);box-shadow:0 6px 24px #00000012}.detail-page-actions>.back-link{flex:1}.detail-action-group{flex:0 0 auto}}
</style>