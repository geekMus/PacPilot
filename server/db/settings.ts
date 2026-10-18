/**
 * 业务配置模型（持久化到 SQLite）。
 * 不再通过环境变量传递这些字段。
 */

/** 生成模式：自定义规则 PAC / genpac(GFWList) */
export type GenerationMode = "custom" | "genpac";

export interface AppSettings {
  /** 启动模式 */
  mode: GenerationMode;
  /** PAC 中的默认代理字符串，如 SOCKS5 127.0.0.1:1080; DIRECT */
  pacProxy: string;
  /** genpac 是否压缩（仅 genpac 模式） */
  pacCompress: boolean;
  /** genpac 精确模式（仅 genpac 模式，预留） */
  pacPrecise: boolean;
  /** GFWList 地址（genpac 模式必填） */
  gfwlistUrl: string;
  /** 黑名单域名（自定义模式） */
  blockList: string[];
  /** 直连域名（自定义模式） */
  directList: string[];
  /** cron 表达式；空则不定时更新 */
  cronSchedule: string;
  /** 成功 Webhook */
  webhookSuccessUrl: string;
  webhookSuccessBody: string;
  /** 失败 Webhook */
  webhookFailureUrl: string;
  webhookFailureBody: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  mode: "custom",
  pacProxy: "SOCKS5 127.0.0.1:1080; DIRECT",
  pacCompress: true,
  pacPrecise: false,
  gfwlistUrl: "https://raw.githubusercontent.com/gfwlist/gfwlist/master/gfwlist.txt",
  blockList: [],
  directList: [],
  cronSchedule: "",
  webhookSuccessUrl: "",
  webhookSuccessBody: "",
  webhookFailureUrl: "",
  webhookFailureBody: "",
};
