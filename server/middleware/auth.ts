import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import type { AppDatabase } from "../db/sqlite";
import { getAdminSecurityStatus, getAdminSessionSecret } from "../services/admin-credentials";
const COOKIE_NAME="genpac_admin_session",SESSION_TTL_MS=7*24*60*60*1000;
function sign(value:string,secret:string):string{return crypto.createHmac("sha256",secret).update(value).digest("hex");}
export function createSessionToken(secret:string):string{const exp=Date.now()+SESSION_TTL_MS,payload="ok."+exp;return payload+"."+sign(payload,secret);}
export function verifySessionToken(token:string|undefined,secret:string):boolean{if(!token)return false;const p=token.split(".");if(p.length!==3)return false;const [flag,expStr,sig]=p;if(flag!=="ok")return false;const exp=Number(expStr);if(!Number.isFinite(exp)||Date.now()>exp)return false;const expected=Buffer.from(sign(flag+"."+expStr,secret),"utf8"),actual=Buffer.from(sig,"utf8");return actual.length===expected.length&&crypto.timingSafeEqual(actual,expected);}
export function setSessionCookie(res:Response,token:string,secure:boolean):void{res.cookie(COOKIE_NAME,token,{httpOnly:true,sameSite:"lax",secure,maxAge:SESSION_TTL_MS,path:"/"});}
export function clearSessionCookie(res:Response):void{res.clearCookie(COOKIE_NAME,{path:"/"});}
export function requireAdmin(database:AppDatabase,allowPasswordChange=false){return(req:Request,res:Response,next:NextFunction):void=>{const token=req.cookies?.[COOKIE_NAME] as string|undefined;if(!verifySessionToken(token,getAdminSessionSecret(database))){res.status(401).json({error:"unauthorized"});return;}if(getAdminSecurityStatus(database).mustChangePassword&&!allowPasswordChange){res.status(428).json({error:"password_change_required"});return;}next();};}
export function isLoggedIn(req:Request,database:AppDatabase):boolean{const token=req.cookies?.[COOKIE_NAME] as string|undefined;return verifySessionToken(token,getAdminSessionSecret(database));}
export { COOKIE_NAME };
