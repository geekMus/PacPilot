import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import type { AppDatabase } from "../db/sqlite";
import type { EnvConfig } from "../config/env";
import { cleanupOperationalLogs, clearOperationalLogs, clearWorkflowHistory, getCurrentWorkflow, getSettings, listWorkflowRuns, listActiveWorkflowRuns, operationalLogStorageBytes, recentLogs, setSettings, updateSettings, getWorkflowRun, listWorkflowStages, deleteWorkflowRun, cancelPendingWorkflow } from "../db/sqlite";
import type { AppSettings, GenerationMode } from "../db/settings";
import { DEFAULT_SETTINGS, normalizeWebhookConfig } from "../db/settings";
import {
  assertSameOrigin,
  checkLoginRateLimit,
  clearLoginFailures,
  clearSessionCookie,
  createSessionToken,
  isLoggedIn,
  recordLoginFailure,
  requireAdmin,
  setSessionCookie,
} from "../middleware/auth";
import { changeAdminPassword, getAdminSecurityStatus, getAdminSessionSecret, verifyAdminPassword } from "../services/admin-credentials";
import { probeGenpac, validatePacProxyString } from "../services/pac-generator";
import { hasActivePacWorkflow, startPacWorkflow } from "../services/workflow";
import { reschedule } from "../services/scheduler";
import { sendWebhookTest, validateWebhookConfig } from "../services/webhook";
import cron from "node-cron";
import { getMonitorSummary, listAccessEvents, listProxyProbeRuns } from "../db/monitoring";
import { getActiveRequestCount, getTcpConnectionCount } from "../services/request-monitor";
import { DEFAULT_PROXY_TEST_URL, parseProxyTestUrl, testConfiguredProxies } from "../services/proxy-probe";
import { assertSafeHttpUrl } from "../utils/url-safety";

function parseList(raw:unknown):string[]{if(Array.isArray(raw))return raw.map(String).map(s=>s.trim()).filter(Boolean);if(typeof raw!=="string")return[];return raw.split(/[\n,]+/).map(s=>s.trim()).filter(Boolean);}
function validTimeZone(v:string):boolean{try{new Intl.DateTimeFormat("en-US",{timeZone:v}).format(new Date());return true;}catch{return false;}}
function bodyToSettings(b:Record<string,unknown>,fallbackProxyTestUrl=DEFAULT_SETTINGS.proxyTestUrl):AppSettings{const m=String(b.mode??"");const mode:GenerationMode=m==="remote"||m==="genpac"?"remote":"custom";return{mode,pacProxy:String(b.pacProxy??""),pacCompress:Boolean(b.pacCompress),listUrl:String(b.listUrl??b.gfwlistUrl??""),blockList:parseList(b.blockList),directList:parseList(b.directList),cronSchedule:String(b.cronSchedule??""),timezone:String(b.timezone??"Asia/Shanghai").trim(),locale:(String(b.locale??"zh").toLowerCase()==="en"?"en":"zh"),proxyTestUrl:String(b.proxyTestUrl??fallbackProxyTestUrl).trim(),logRetentionDays:Math.max(0,Math.min(3650,Math.floor(Number(b.logRetentionDays??DEFAULT_SETTINGS.logRetentionDays)||0))),webhookSuccessUrl:String(b.webhookSuccessUrl??""),webhookSuccessBody:String(b.webhookSuccessBody??""),webhookFailureUrl:String(b.webhookFailureUrl??""),webhookFailureBody:String(b.webhookFailureBody??""),webhookSuccessConfig:normalizeWebhookConfig(b.webhookSuccessConfig,String(b.webhookSuccessUrl??""),String(b.webhookSuccessBody??"")),webhookFailureConfig:normalizeWebhookConfig(b.webhookFailureConfig,String(b.webhookFailureUrl??""),String(b.webhookFailureBody??""))};}
function persistSettings(body:Record<string,unknown>,env:EnvConfig,database:AppDatabase):{settings:AppSettings}|{error:string}{
 const p=bodyToSettings(body,getSettings(database).proxyTestUrl);
 if(p.mode==="remote"){
  const listUrlError=assertSafeHttpUrl(p.listUrl,"rule list URL");
  if(listUrlError)return {error:listUrlError};
 }
 if(!p.timezone||!validTimeZone(p.timezone))return {error:"Invalid timezone. Choose from the suggestions or enter a valid IANA timezone such as Asia/Shanghai."};
 try{p.proxyTestUrl=parseProxyTestUrl(p.proxyTestUrl).toString();}catch(e){return {error:e instanceof Error?e.message:"Invalid proxy test URL."};}
 const proxyError=validatePacProxyString(p.pacProxy);
 if(proxyError)return {error:proxyError};
 const expr=p.cronSchedule.trim();
 if(expr&&(expr.split(/\s+/).length!==5||!cron.validate(expr)))return {error:"Invalid cron expression; use the 5-field form (minute hour day month weekday)."};
 for(const c of [p.webhookSuccessConfig,p.webhookFailureConfig]){
  if(c.url.trim()){
   const errors=validateWebhookConfig(c);
   if(errors.length)return {error:errors.join("\n")};
  }
 }
 const settings=updateSettings(database,p);
 reschedule(database,env.dataDir);
 return {settings};
}
export function adminRoutes(env:EnvConfig,database:AppDatabase):Router{
 const router=Router();
 let monitorProbeInProgress = false;
 router.get("/api/admin/session",(req,res)=>res.json({loggedIn:isLoggedIn(req,database),...getAdminSecurityStatus(database)}));
 router.post("/api/admin/login",(req,res)=>{
  const originError=assertSameOrigin(req);
  if(originError){res.status(403).json({error:originError});return;}
  const rateError=checkLoginRateLimit(req);
  if(rateError){res.status(429).json({error:rateError});return;}
  const pw=String(req.body?.password??"");
  if(!verifyAdminPassword(database,pw)){
   recordLoginFailure(req);
   res.status(401).json({error:"Invalid password"});
   return;
  }
  clearLoginFailures(req);
  const token=createSessionToken(getAdminSessionSecret(database));
  const secure=req.secure||req.headers["x-forwarded-proto"]==="https";
  setSessionCookie(res,token,secure);
  res.json({ok:true,...getAdminSecurityStatus(database)});
 });
 router.post("/api/admin/logout",(req,res)=>{
  const originError=assertSameOrigin(req);
  if(originError){res.status(403).json({error:originError});return;}
  clearSessionCookie(res);
  res.json({ok:true});
 });
 router.post("/api/admin/password",requireAdmin(database,true),(req,res)=>{
  const originError=assertSameOrigin(req);
  if(originError){res.status(403).json({error:originError});return;}
  try{
   changeAdminPassword(database,String(req.body?.currentPassword??""),String(req.body?.newPassword??""));
   clearSessionCookie(res);
   res.json({ok:true});
  }catch(e){res.status(400).json({error:e instanceof Error?e.message:String(e)});}
 });
 router.get("/api/admin/settings",requireAdmin(database),(_req,res)=>res.json(getSettings(database)));
 router.put("/api/admin/settings",requireAdmin(database),(req,res)=>{const result=persistSettings((req.body||{}) as Record<string,unknown>,env,database);if("error" in result){res.status(400).json({error:result.error});return;}res.json(result.settings);});
 router.post("/api/admin/settings/save-and-generate",requireAdmin(database),(req,res)=>{const saved=persistSettings((req.body||{}) as Record<string,unknown>,env,database);if("error" in saved){res.status(400).json({error:saved.error});return;}try{const workflowId=startPacWorkflow(database,env.dataDir,"save-and-generate");res.status(202).json({settings:saved.settings,workflowId,status:getWorkflowRun(database,workflowId)?.status??"pending"});}catch(e){res.status(409).json({error:e instanceof Error?e.message:String(e)});}});
 router.post("/api/admin/webhook-test",requireAdmin(database),async(req,res)=>{const c=normalizeWebhookConfig(req.body?.config??req.body),errors=validateWebhookConfig(c);if(errors.length){res.status(400).json({error:errors.join("\n")});return;}res.json(await sendWebhookTest(c,getSettings(database).timezone));});
 router.post("/api/admin/generate",requireAdmin(database),(_req,res)=>{try{const workflowId=startPacWorkflow(database,env.dataDir,"manual");res.status(202).json({workflowId,status:getWorkflowRun(database,workflowId)?.status??"pending"});}catch(e){res.status(409).json({error:e instanceof Error?e.message:String(e)});}});
 router.get("/api/admin/workflows",requireAdmin(database),(req,res)=>{res.setHeader("Cache-Control","no-store");const limit=Math.min(100,Math.max(1,Number.parseInt(String(req.query.limit??"50"),10)||50));const beforeId=Math.max(0,Number.parseInt(String(req.query.beforeId??"0"),10)||0);const page=listWorkflowRuns(database,limit+1,beforeId);const total=Number((database.query("SELECT COUNT(*) AS total FROM workflow_runs").get() as {total:number}).total);const hasMore=page.length>limit;res.json({current:getCurrentWorkflow(database),active:listActiveWorkflowRuns(database),runs:page.slice(0,limit),beforeId,nextCursor:page.length>limit? page[limit-1]?.id ?? null : page[page.length-1]?.id ?? null,total,hasMore});});
 router.delete("/api/admin/workflows",requireAdmin(database),(_req,res)=>{
  try{
   const result=clearWorkflowHistory(database);
   if(result.activeRuns>0){res.status(409).json({error:"仍有工作流在等待或执行中，不能清空执行历史。请等所有任务结束后重试。",activeRuns:result.activeRuns});return;}
   if(result.deletedRuns>0)database.exec("PRAGMA wal_checkpoint(TRUNCATE); VACUUM;");
   res.json({ok:true,deletedRuns:result.deletedRuns});
  }catch(error){res.status(500).json({error:error instanceof Error?error.message:String(error)});}
 });
 router.get("/api/admin/workflows/:id",requireAdmin(database),(req,res)=>{res.setHeader("Cache-Control","no-store");const id=Number.parseInt(req.params.id,10);if(!Number.isSafeInteger(id)||id<1){res.status(400).json({error:"工作流编号无效。"});return;}const run=getWorkflowRun(database,id);if(!run){res.status(404).json({error:"找不到该工作流执行记录。"});return;}res.json({run,stages:listWorkflowStages(database,id)});});
 router.post("/api/admin/workflows/:id/cancel",requireAdmin(database),(req,res)=>{res.setHeader("Cache-Control","no-store");const id=Number.parseInt(req.params.id,10);if(!Number.isSafeInteger(id)||id<1){res.status(400).json({error:"工作流编号无效。"});return;}const result=cancelPendingWorkflow(database,id);if(result==="not-found"){res.status(404).json({error:"找不到该工作流执行记录。"});return;}if(result==="not-pending"){res.status(409).json({error:"该工作流已开始执行或已经结束，无法取消排队。"});return;}res.json({ok:true,id,status:"cancelled"});});
  router.delete("/api/admin/workflows/:id",requireAdmin(database),(req,res)=>{res.setHeader("Cache-Control","no-store");const id=Number.parseInt(req.params.id,10);if(!Number.isSafeInteger(id)||id<1){res.status(400).json({error:"工作流编号无效。"});return;}const result=deleteWorkflowRun(database,id);if(result==="not-found"){res.status(404).json({error:"找不到该工作流执行记录。"});return;}if(result==="active"){res.status(409).json({error:"工作流仍在等待或执行中，不能删除。"});return;}res.json({ok:true,id});});
 router.get("/api/admin/storage",requireAdmin(database),(_req,res)=>{
  res.setHeader("Cache-Control","no-store");
  let dataBytes=0;
  const walk=(dir:string):void=>{try{for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,entry.name);if(entry.isSymbolicLink())continue;if(entry.isDirectory())walk(full);else if(entry.isFile())dataBytes+=fs.statSync(full).size;}}catch{/* missing or inaccessible data directory */}};
  walk(env.dataDir);
  const dbBytes=["genpac.db","genpac.db-wal","genpac.db-shm"].reduce((sum,name)=>{try{return sum+fs.statSync(path.join(env.dataDir,name)).size;}catch{return sum;}},0);
  const counts=database.query("SELECT (SELECT COUNT(*) FROM generation_log) AS generationLogs,(SELECT COUNT(*) FROM access_events) AS accessEvents,(SELECT COUNT(*) FROM proxy_probe_runs) AS proxyProbeRuns,(SELECT COUNT(*) FROM workflow_runs) AS workflows,(SELECT COUNT(*) FROM workflow_runs WHERE status IN ('pending','running')) AS activeWorkflows").get();
  const pacFileInfo=(name:string)=>{
   try{const stat=fs.statSync(path.join(env.dataDir,name));if(!stat.isFile())return{exists:false,sizeBytes:0,modifiedAt:null};return{exists:true,sizeBytes:stat.size,modifiedAt:stat.mtime.toISOString()};}
   catch{return{exists:false,sizeBytes:0,modifiedAt:null};}
  };
  res.json({dataBytes,dbBytes,logBytes:operationalLogStorageBytes(database),retentionDays:getSettings(database).logRetentionDays,counts,pacFiles:{proxyPac:pacFileInfo("proxy.pac"),proxySourcePac:pacFileInfo("proxy.source.pac")}});
 });
 router.delete("/api/admin/pac-files",requireAdmin(database),(_req,res)=>{
  if(hasActivePacWorkflow(database)){res.status(409).json({error:"仍有工作流在等待或执行中，不能删除 PAC 文件。请等任务结束后重试。"});return;}
  const deleted:string[]=[];
  try{
   for(const name of ["proxy.pac","proxy.source.pac"]){
    try{fs.unlinkSync(path.join(env.dataDir,name));deleted.push(name);}
    catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;}
   }
   const fileInfo=(name:string)=>{try{const stat=fs.statSync(path.join(env.dataDir,name));return{exists:stat.isFile(),sizeBytes:stat.isFile()?stat.size:0,modifiedAt:stat.isFile()?stat.mtime.toISOString():null};}catch{return{exists:false,sizeBytes:0,modifiedAt:null};}};
   res.json({ok:true,deleted,pacFiles:{proxyPac:fileInfo("proxy.pac"),proxySourcePac:fileInfo("proxy.source.pac")}});
  }catch(error){res.status(500).json({error:error instanceof Error?error.message:String(error)});}
 });
 router.post("/api/admin/logs/cleanup",requireAdmin(database),(_req,res)=>{const deleted=cleanupOperationalLogs(database);if(deleted.generationLogs+deleted.accessEvents+deleted.proxyProbeRuns>0){database.exec("PRAGMA wal_checkpoint(TRUNCATE); VACUUM;");}res.json({deleted,retentionDays:getSettings(database).logRetentionDays});});
 router.post("/api/admin/logs/clear",requireAdmin(database),(_req,res)=>{
  try{
   const deleted=clearOperationalLogs(database);
   database.exec("PRAGMA wal_checkpoint(TRUNCATE); VACUUM;");
   res.json({deleted,retentionDays:getSettings(database).logRetentionDays});
  }catch(error){res.status(500).json({error:error instanceof Error?error.message:String(error)});}
 });
 router.post("/api/admin/factory-reset",requireAdmin(database),(req,res)=>{
  if(req.body?.confirm!=="RESET"){res.status(400).json({error:"恢复出厂设置确认信息无效，请刷新页面后重试。"});return;}
  if(hasActivePacWorkflow(database)){res.status(409).json({error:"工作流正在执行，请等待完成后再恢复出厂设置。"});return;}
  try{
   database.exec("BEGIN IMMEDIATE");
   database.exec("DELETE FROM generation_log; DELETE FROM access_events; DELETE FROM proxy_probe_runs; DELETE FROM workflow_runs;");
   setSettings(database,DEFAULT_SETTINGS);
   database.exec("COMMIT");
   database.exec("PRAGMA wal_checkpoint(TRUNCATE); VACUUM;");
   for(const name of ["proxy.pac","proxy.source.pac"]){try{fs.unlinkSync(path.join(env.dataDir,name));}catch{/* already absent */}}
   reschedule(database,env.dataDir);
   res.json({ok:true,message:"已恢复默认配置并清理运行记录。管理员密码保持不变。"});
  }catch(e){try{database.exec("ROLLBACK");}catch{/* transaction already closed */}res.status(500).json({error:e instanceof Error?e.message:String(e)});}
 });
 router.get("/api/admin/logs",requireAdmin(database),(_req,res)=>res.json(recentLogs(database,50,getSettings(database).timezone)));
 router.get("/api/admin/logs/page",requireAdmin(database),(req,res)=>{
  res.setHeader("Cache-Control","no-store");
  const limit=Math.min(100,Math.max(1,Number.parseInt(String(req.query.limit??"50"),10)||50));
  const beforeId=Math.max(0,Number.parseInt(String(req.query.beforeId??"0"),10)||0);
  const rows=recentLogs(database,limit+1,getSettings(database).timezone,0,beforeId);
  const total=Number((database.query("SELECT COUNT(*) AS total FROM generation_log").get() as {total:number}).total);
  const hasMore=rows.length>limit;
  res.json({items:rows.slice(0,limit),nextCursor:rows.length>limit? rows[limit-1]?.id ?? null : rows[rows.length-1]?.id ?? null,total,hasMore});
 });
 router.get("/api/admin/genpac-status",requireAdmin(database),async(_req,res)=>res.json(await probeGenpac()));
 router.get("/api/admin/monitor/summary",requireAdmin(database),(_req,res)=>{
  res.setHeader("Cache-Control","no-store");
  const summary=getMonitorSummary(database,getActiveRequestCount(),getTcpConnectionCount());
  res.json({...summary,timezone:getSettings(database).timezone});
 });
 router.get("/api/admin/monitor/access",requireAdmin(database),(req,res)=>{
  res.setHeader("Cache-Control","no-store");
  const paged=String(req.query.paged??"") === "1";
  const limit=Math.min(paged?100:200,Math.max(1,Number.parseInt(String(req.query.limit??"50"),10)||50));
  const beforeId=Math.max(0,Number.parseInt(String(req.query.beforeId??"0"),10)||0);
  const rows=listAccessEvents(database,paged?limit+1:limit,beforeId);
  if(!paged){res.json(rows);return;}
  const hasMore=rows.length>limit;
  const total=Number((database.query("SELECT COUNT(*) AS total FROM access_events").get() as {total:number}).total);
  res.json({items:rows.slice(0,limit),nextCursor:rows.length>limit? rows[limit-1]?.id ?? null : rows[rows.length-1]?.id ?? null,total,hasMore});
 });
 router.get("/api/admin/monitor/probes",requireAdmin(database),(req,res)=>{
  res.setHeader("Cache-Control","no-store");
  const paged=String(req.query.paged??"") === "1";
  const limit=Math.min(paged?100:200,Math.max(1,Number.parseInt(String(req.query.limit??"30"),10)||30));
  const beforeId=Math.max(0,Number.parseInt(String(req.query.beforeId??"0"),10)||0);
  const rows=listProxyProbeRuns(database,paged?limit+1:limit,beforeId);
  if(!paged){res.json(rows);return;}
  const hasMore=rows.length>limit;
  const total=Number((database.query("SELECT COUNT(*) AS total FROM proxy_probe_runs").get() as {total:number}).total);
  res.json({items:rows.slice(0,limit),nextCursor:rows.length>limit? rows[limit-1]?.id ?? null : rows[rows.length-1]?.id ?? null,total,hasMore});
 });
 router.get("/api/admin/monitor/probe-target",requireAdmin(database),(_req,res)=>{res.setHeader("Cache-Control","no-store");res.json({url:getSettings(database).proxyTestUrl||DEFAULT_PROXY_TEST_URL});});
 router.put("/api/admin/monitor/probe-target",requireAdmin(database),(req,res)=>{let target:URL;try{target=parseProxyTestUrl(String(req.body?.url??""));}catch(e){res.status(400).json({error:e instanceof Error?e.message:"代理测试地址无效。"});return;}const next=updateSettings(database,{proxyTestUrl:target.toString()});res.json({url:next.proxyTestUrl});});
 router.post("/api/admin/monitor/probe",requireAdmin(database),async(_req,res)=>{
  res.setHeader("Cache-Control","no-store");
  if(monitorProbeInProgress){res.status(409).json({error:"已有代理连通性测试正在运行，请稍后再试。"});return;}
  monitorProbeInProgress=true;
  try{
   const settings=getSettings(database);const result=await testConfiguredProxies(database,settings.pacProxy,settings.proxyTestUrl);
   res.json(result);
  }catch(e){
   res.status(400).json({error:e instanceof Error?e.message:String(e)});
  }finally{
   monitorProbeInProgress=false;
  }
 });
 return router;
}
