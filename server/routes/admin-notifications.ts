import {Router} from "express";
import type {ApplicationStorage} from "../storage/repositories";
import {requireAdmin} from "../middleware/auth";
import {getNotificationAdminView,removeNotificationChannel,removeNotificationRule,retryNotificationDelivery,saveNotificationChannel,saveNotificationRule,testNotificationChannel} from "../services/notifications";
export function adminNotificationRoutes(s:ApplicationStorage){const r=Router(),guard=requireAdmin(s.credentials),fail=(res:import("express").Response,e:unknown)=>res.status(400).json({error:e instanceof Error?e.message:String(e)});
r.get("/api/admin/notifications",guard,async(_q,res)=>{res.setHeader("Cache-Control","no-store");res.json(await getNotificationAdminView(s))});
r.post("/api/admin/notifications/channels",guard,async(q,res)=>{try{res.status(201).json(await saveNotificationChannel(s,q.body||{}))}catch(e){fail(res,e)}});
r.put("/api/admin/notifications/channels/:id",guard,async(q,res)=>{try{res.json(await saveNotificationChannel(s,q.body||{},q.params.id))}catch(e){fail(res,e)}});
r.delete("/api/admin/notifications/channels/:id",guard,async(q,res)=>{try{await removeNotificationChannel(s,q.params.id);res.json({ok:true})}catch(e){fail(res,e)}});
r.post("/api/admin/notifications/channels/:id/test",guard,async(q,res)=>{try{res.json(await testNotificationChannel(s,q.params.id))}catch(e){fail(res,e)}});
r.post("/api/admin/notifications/rules",guard,async(q,res)=>{try{res.status(201).json(await saveNotificationRule(s,q.body||{}))}catch(e){fail(res,e)}});
r.put("/api/admin/notifications/rules/:id",guard,async(q,res)=>{try{res.json(await saveNotificationRule(s,q.body||{},q.params.id))}catch(e){fail(res,e)}});
r.delete("/api/admin/notifications/rules/:id",guard,async(q,res)=>{try{await removeNotificationRule(s,q.params.id);res.json({ok:true})}catch(e){fail(res,e)}});
r.post("/api/admin/notifications/deliveries/:id/retry",guard,async(q,res)=>{try{await retryNotificationDelivery(s,q.params.id);res.json({ok:true})}catch(e){fail(res,e)}});
return r}
