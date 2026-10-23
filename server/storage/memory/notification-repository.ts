import type { NotificationDocument } from "../../../shared/contracts";
import type { SyncNotificationRepository } from "../repositories";
const empty=():NotificationDocument=>({schemaVersion:1,legacyMigrated:false,channels:[],rules:[],events:[],deliveries:[]});
export function createMemoryNotificationRepository():SyncNotificationRepository&{reset():void}{let doc=empty();return{get:()=>structuredClone(doc),set(value){doc=structuredClone(value)},reset(){doc=empty()}}}
