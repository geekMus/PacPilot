import { Router } from "express";
import type { AppDatabase } from "../db/sqlite";
import type { EnvConfig } from "../config/env";
import { getSettings, recentLogs, updateSettings } from "../db/sqlite";
import type { AppSettings, GenerationMode } from "../db/settings";
import { DEFAULT_SETTINGS, normalizeWebhookConfig } from "../db/settings";
import { clearSessionCookie, createSessionToken, isLoggedIn, requireAdmin, setSessionCookie } from "../middleware/auth";
import { changeAdminPassword, getAdminSecurityStatus, getAdminSessionSecret, verifyAdminPassword } from "../services/admin-credentials";
import { generatePac, probeGenpac, validatePacProxyString } from "../services/pac-generator";
import { reschedule } from "../services/scheduler";
import { sendWebhookTest, validateWebhookConfig } from "../services/webhook";
import cron from "node-cron";
import { getMonitorSummary, listAccessEvents, listProxyProbeRuns } from "../db/monitoring";
import { getActiveRequestCount, getTcpConnectionCount } from "../services/request-monitor";
import { DEFAULT_PROXY_TEST_URL, parseProxyTestUrl, testConfiguredProxies } from "../services/proxy-probe";

function parseList(raw:unknown):string[]{if(Array.isArray(raw))return raw.map(String).map(s=>s.trim()).filter(Boolean);if(typeof raw!=="string")return[];return raw.split(/[\n,]+/).map(s=>s.trim()).filter(Boolean);}
function validTimeZone(v:string):boolean{try{new Intl.DateTimeFormat("en-US",{timeZone:v}).format(new Date());return true;}catch{return false;}}
function bodyToSettings(b:Record<string,unknown>,fallbackProxyTestUrl=DEFAULT_SETTINGS.proxyTestUrl):AppSettings{const m=String(b.mode??"");const mode:GenerationMode=m==="remote"||m==="genpac"?"remote":"custom";return{mode,pacProxy:String(b.pacProxy??""),pacCompress:Boolean(b.pacCompress),listUrl:String(b.listUrl??b.gfwlistUrl??""),blockList:parseList(b.blockList),directList:parseList(b.directList),cronSchedule:String(b.cronSchedule??""),timezone:String(b.timezone??"Asia/Shanghai").trim(),proxyTestUrl:String(b.proxyTestUrl??fallbackProxyTestUrl).trim(),webhookSuccessUrl:String(b.webhookSuccessUrl??""),webhookSuccessBody:String(b.webhookSuccessBody??""),webhookFailureUrl:String(b.webhookFailureUrl??""),webhookFailureBody:String(b.webhookFailureBody??""),webhookSuccessConfig:normalizeWebhookConfig(b.webhookSuccessConfig,String(b.webhookSuccessUrl??""),String(b.webhookSuccessBody??"")),webhookFailureConfig:normalizeWebhookConfig(b.webhookFailureConfig,String(b.webhookFailureUrl??""),String(b.webhookFailureBody??""))};}
export function adminRoutes(env:EnvConfig,database:AppDatabase):Router{
 const router=Router();
 let monitorProbeInProgress = false;
 router.get("/api/admin/session",(req,res)=>res.json({loggedIn:isLoggedIn(req,database),...getAdminSecurityStatus(database)}));
 router.post("/api/admin/login",(req,res)=>{const pw=String(req.body?.password??"");if(!verifyAdminPassword(database,pw)){res.status(401).json({error:"密码错误"});return;}const token=createSessionToken(getAdminSessionSecret(database));const secure=req.secure||req.headers["x-forwarded-proto"]==="https";setSessionCookie(res,token,secure);res.json({ok:true,...getAdminSecurityStatus(database)});});
 router.post("/api/admin/logout",(_req,res)=>{clearSessionCookie(res);res.json({ok:true});});
 router.post("/api/admin/password",requireAdmin(database,true),(req,res)=>{try{changeAdminPassword(database,String(req.body?.currentPassword??""),String(req.body?.newPassword??""));clearSessionCookie(res);res.json({ok:true});}catch(e){res.status(400).json({error:e instanceof Error?e.message:String(e)});}});
 router.get("/api/admin/settings",requireAdmin(database),(_req,res)=>res.json(getSettings(database)));
 router.put("/api/admin/settings",requireAdmin(database),(req,res)=>{const p=bodyToSettings((req.body||{}) as Record<string,unknown>,getSettings(database).proxyTestUrl);if(p.mode==="remote"){let listUrl:URL;try{listUrl=new URL(p.listUrl);}catch{res.status(400).json({error:"规则列表 URL 无效，请使用完整的 HTTP(S) 地址。"});return;}if((listUrl.protocol!=="http:"&&listUrl.protocol!=="https:")||!listUrl.hostname||listUrl.username||listUrl.password){res.status(400).json({error:"规则列表 URL 必须使用有效的 HTTP(S) 地址，且不能包含 URL 用户名或密码。"});return;}}if(!p.timezone||!validTimeZone(p.timezone)){res.status(400).json({error:"时区无效。请从建议列表选择，或输入有效 IANA 时区，例如 Asia/Shanghai。"});return;}try{p.proxyTestUrl=parseProxyTestUrl(p.proxyTestUrl).toString();}catch(e){res.status(400).json({error:e instanceof Error?e.message:"代理测试地址无效。"});return;}const proxyError=validatePacProxyString(p.pacProxy);if(proxyError){res.status(400).json({error:proxyError});return;}const expr=p.cronSchedule.trim();if(expr&&(expr.split(/\s+/).length!==5||!cron.validate(expr))){res.status(400).json({error:"Cron 表达式无效；请使用 5 段格式（分 时 日 月 周）。"});return;}for(const c of [p.webhookSuccessConfig,p.webhookFailureConfig]){if(c.url.trim()){const errors=validateWebhookConfig(c);if(errors.length){res.status(400).json({error:errors.join("\n")});return;}}}const next=updateSettings(database,p);reschedule(database,env.dataDir);res.json(next);});
 router.post("/api/admin/webhook-test",requireAdmin(database),async(req,res)=>{const c=normalizeWebhookConfig(req.body?.config??req.body),errors=validateWebhookConfig(c);if(errors.length){res.status(400).json({error:errors.join("\n")});return;}res.json(await sendWebhookTest(c,getSettings(database).timezone));});
 router.post("/api/admin/generate",requireAdmin(database),async(_req,res)=>{const result=await generatePac(database,env.dataDir);res.status(200).json(result);});
 router.get("/api/admin/logs",requireAdmin(database),(_req,res)=>res.json(recentLogs(database,50,getSettings(database).timezone)));
 router.get("/api/admin/genpac-status",requireAdmin(database),async(_req,res)=>res.json(await probeGenpac()));
 router.get("/api/admin/monitor/summary",requireAdmin(database),(_req,res)=>{
  res.setHeader("Cache-Control","no-store");
  res.json({...getMonitorSummary(database,getActiveRequestCount(),getTcpConnectionCount()),timezone:getSettings(database).timezone});
 });
 router.get("/api/admin/monitor/access",requireAdmin(database),(req,res)=>{
  res.setHeader("Cache-Control","no-store");
  const limit=Math.min(200,Math.max(1,Number.parseInt(String(req.query.limit??"50"),10)||50));
  res.json(listAccessEvents(database,limit));
 });
 router.get("/api/admin/monitor/probes",requireAdmin(database),(req,res)=>{
  res.setHeader("Cache-Control","no-store");
  const limit=Math.min(200,Math.max(1,Number.parseInt(String(req.query.limit??"30"),10)||30));
  res.json(listProxyProbeRuns(database,limit));
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
