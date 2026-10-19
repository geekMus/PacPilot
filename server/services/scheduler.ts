import cron, { type ScheduledTask } from "node-cron";
import type { AppDatabase } from "../db/sqlite";
import { getSettings } from "../db/sqlite";
import { runPacWorkflow } from "./workflow";
let currentTask:ScheduledTask|null=null,currentKey="";
export function reschedule(database:AppDatabase,dataDir:string):void{
 const s=getSettings(database),expr=s.cronSchedule.trim(),key=expr+"\n"+s.timezone;if(currentTask&&currentKey===key)return;
 if(currentTask){currentTask.stop();currentTask=null;currentKey="";console.log("[cron] previous schedule stopped");}
 if(!expr){console.log("[cron] no schedule configured");return;}if(!cron.validate(expr)){console.error("[cron] invalid expression: "+expr);return;}
 currentTask=cron.schedule(expr,()=>{console.log("[cron] triggered: "+expr+" (timezone="+s.timezone+")");void runPacWorkflow(database,dataDir,"scheduled").catch((error)=>console.error("[cron] workflow failed:",error));},{timezone:s.timezone});currentKey=key;console.log("[cron] scheduled: "+expr+" (timezone="+s.timezone+")");
}
export function stopScheduler():void{if(currentTask){currentTask.stop();currentTask=null;currentKey="";}}
