/**
 * 业务配置模型（持久化到 SQLite）。
 * 不再通过环境变量传递这些字段。
 */

/**
 * 生成模式：
 * - custom：后台填写的直连 / 黑名单
 * - remote：从用户配置的远程列表 URL 拉取规则并生成 PAC
 * （历史值 genpac 会在读取时归一化为 remote）
 */
export type GenerationMode = "custom" | "remote";

export interface AppSettings {
  mode: GenerationMode;
  /** PAC 中的默认代理字符串，如 SOCKS5 127.0.0.1:1080; DIRECT */
  pacProxy: string;
  /** 是否压缩生成的 PAC（remote 模式） */
  pacCompress: boolean;
  /**
   * 精确匹配预留（当前 remote 使用域名后缀表；true 时保留更多规则细节，后续可扩展）
   */
  pacPrecise: boolean;
  /**
   * 远程规则列表 URL。
   * 支持：标准 GFWList（Base64）、明文域名列表、AutoProxy/ABP 风格规则。
   */
  listUrl: string;
  blockList: string[];
  directList: string[];
  cronSchedule: string;
  webhookSuccessUrl: string;
  webhookSuccessBody: string;
  webhookFailureUrl: string;
  webhookFailureBody: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  mode: "custom",
  pacProxy: "SOCKS5 127.0.0.1:1080; DIRECT",
  pacCompress: true,
  pacPrecise: false,
  listUrl:
    "https://raw.githubusercontent.com/gfwlist/gfwlist/master/gfwlist.txt",
  blockList: [],
  directList: [],
  cronSchedule: "",
  webhookSuccessUrl: "",
  webhookSuccessBody: "",
  webhookFailureUrl: "",
  webhookFailureBody: "",
};
