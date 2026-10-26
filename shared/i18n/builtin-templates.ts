import type { AppLocale } from "./locale";

/**
 * 通知渠道「内置默认模板」的字面量。
 *
 * 之所以单独成一个文件，而不是直接读 `catalogs`：通知渠道编辑器需要同时识别中英文
 * 两套内置默认值（历史版本会把默认模板当作真实值存库），若为此导入 `en_US`，整份
 * 英文目录（gzip 后约 15KB）就会被拉进通知页的 chunk，拖慢那一页的首屏。
 * 词条本身仍由 `zh_CN.ts` / `en_US.ts` 引用这里，保证默认模板只有一个来源。
 */
export const BUILTIN_MESSAGE_TEMPLATES: Record<
  AppLocale,
  { defaultMessageTemplate: string; testMessageTemplate: string }
> = {
  zh_CN: {
    defaultMessageTemplate:
      "PacPilot 通知\n事件：{{event}}\n状态：{{status}}\n时间：{{timestamp}}\n详情：{{message}}",
    testMessageTemplate: "PacPilot 测试通知\n时间：{{timestamp}}\n结果：{{message}}",
  },
  en_US: {
    defaultMessageTemplate:
      "PacPilot notification\nEvent: {{event}}\nStatus: {{status}}\nTime: {{timestamp}}\nDetails: {{message}}",
    testMessageTemplate: "PacPilot test notification\nTime: {{timestamp}}\nResult: {{message}}",
  },
};
