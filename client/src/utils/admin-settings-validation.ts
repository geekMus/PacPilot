import type { WebhookConfig } from "@shared/contracts";
import { analyzeDomainRules } from "@/utils/domain-rules";

export type WebhookFieldErrors = {
  url: string;
  headers: string;
  body: string;
  testBody: string;
  secret: string;
};

export function createAdminSettingsValidators<T extends (...args: any[]) => string>(t: T) {
  function jsonBodyError(raw: string): string {
    const s = raw.trim();
    if (!s) return "";
    try {
      const value: unknown = JSON.parse(s);
      if (value === null || typeof value !== "object") return t("settings.jsonTopLevel");
      return "";
    } catch {
      return t("settings.jsonFormatError");
    }
  }

  function validateWebhookDraft(
    config: WebhookConfig,
    label: string,
    options?: { hasSavedSecret?: boolean }
  ): WebhookFieldErrors {
    const errors: WebhookFieldErrors = { url: "", headers: "", body: "", testBody: "", secret: "" };
    if (config.provider === "custom") {
      const url = config.url.trim();
      const rawHeaders = config.headers.trim();
      const hasCustomRequest = Boolean(
        url || config.body.trim() || (rawHeaders && rawHeaders !== "{}")
      );
      if (url && !looksLikeUrl(url)) errors.url = t("settings.webhookNeedUrl", { label });
      else if (!url && hasCustomRequest)
        errors.url = t("settings.webhookNeedUrlForBody", { label });
      const bodyError = jsonBodyError(config.body);
      if (bodyError) errors.body = t("settings.webhookBodyError", { label, error: bodyError });
      const testBodyError = jsonBodyError(config.testBody);
      if (testBodyError)
        errors.testBody = t("settings.webhookTestBodyError", { label, error: testBodyError });
      if (rawHeaders) {
        try {
          const headers: unknown = JSON.parse(rawHeaders);
          if (!headers || typeof headers !== "object" || Array.isArray(headers))
            errors.headers = t("settings.webhookHeadersError", { label });
          else {
            for (const [name, value] of Object.entries(headers as Record<string, unknown>)) {
              if (!name.trim() || typeof value !== "string") {
                errors.headers = t("settings.headersMustStrings", { label });
                break;
              }
              if (
                /^(host|content-length|connection|transfer-encoding|content-type)$/i.test(name) ||
                /[\r\n]/.test(value)
              ) {
                errors.headers = label + t("settings.headersTransport");
                break;
              }
            }
          }
        } catch {
          errors.headers = t("settings.headersJsonError", { label });
        }
      }
    } else if (config.provider === "dingtalk") {
      // 编辑已有渠道时密钥不回显；留空表示沿用已保存的密钥（服务端 mergeSecrets 负责），不算错误。
      const keepsSavedSecret = !config.dingTalkSecret.trim() && Boolean(options?.hasSavedSecret);
      if (config.url.trim()) {
        if (!looksLikeUrl(config.url.trim())) errors.url = t("settings.dingTalkUrl", { label });
        else if (!new URL(config.url.trim()).searchParams.has("access_token"))
          errors.url = t("settings.dingTalkToken", { label });
        if (!config.dingTalkSecret.trim() && !keepsSavedSecret)
          errors.secret = t("settings.dingTalkSecret", { label });
      } else if (config.dingTalkSecret.trim()) {
        errors.url = t("settings.dingTalkSecretNeedsUrl", { label });
      }
    }
    return errors;
  }

  function webhookErrorMessages(errors: WebhookFieldErrors): string[] {
    return [errors.url, errors.headers, errors.body, errors.testBody, errors.secret].filter(
      Boolean
    );
  }

  function validDomainOrIPv4(host: string): boolean {
    if (!host || host.length > 253) return false;
    const ipv4Like = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host);
    if (ipv4Like) {
      return host
        .split(".")
        .every((part) => /^(0|[1-9]\d{0,2})$/.test(part) && Number(part) <= 255);
    }
    const labelPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
    return host
      .replace(/\.$/, "")
      .split(".")
      .every((part) => labelPattern.test(part));
  }

  function validatePacProxyString(rawValue: string): string | null {
    const raw = rawValue.trim();
    if (!raw) return t("settings.pacProxyRequired");
    const entries = raw.split(";").map((entry) => entry.trim());
    // 与服务端保持一致：只允许单个可选的结尾分号。
    if (entries[entries.length - 1] === "") entries.pop();
    if (entries.length === 0 || entries.some((entry) => !entry)) {
      return t("settings.proxySemicolon");
    }
    for (const [index, entry] of entries.entries()) {
      if (/^DIRECT$/i.test(entry)) continue;
      const match = entry.match(/^(PROXY|HTTP|HTTPS|SOCKS|SOCKS4|SOCKS5)\s+(\S+)$/i);
      if (!match) {
        return t("settings.proxyItemInvalid", { n: index + 1, item: entry.slice(0, 80) });
      }
      const endpointMatch = match[2].match(/^(?:\[([^\]]+)\]|([^:\[\]\s]+)):(\d{1,5})$/);
      if (!endpointMatch) {
        return t("settings.proxyHostInvalid", { n: index + 1 });
      }
      const host = endpointMatch[1] ?? endpointMatch[2] ?? "";
      const port = Number(endpointMatch[3]);
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        return t("settings.proxyPortInvalid", { n: index + 1 });
      }
      if (endpointMatch[1]) {
        try {
          new URL("http://[" + host + "]:" + port + "/");
        } catch {
          return t("settings.proxyIpv6Invalid", { n: index + 1 });
        }
      } else if (!validDomainOrIPv4(host)) {
        return t("settings.proxyHostnameInvalid", { n: index + 1 });
      }
    }
    return null;
  }

  function validateDomainRules(rawValue: string, list: "direct" | "block"): string | null {
    const label = list === "direct" ? t("settings.directList") : t("settings.blockList");
    const analysis = analyzeDomainRules(
      list === "direct" ? rawValue : "",
      list === "block" ? rawValue : ""
    );
    const firstError = [...analysis.direct.diagnostics, ...analysis.block.diagnostics].find(
      (item) => item.severity === "error"
    );
    return firstError
      ? t("settings.domainLineError", { label, line: firstError.line, message: firstError.message })
      : null;
  }

  function looksLikeUrl(s: string): boolean {
    try {
      const u = new URL(s);
      return (
        (u.protocol === "http:" || u.protocol === "https:") &&
        Boolean(u.hostname) &&
        !u.username &&
        !u.password
      );
    } catch {
      return false;
    }
  }

  return {
    looksLikeUrl,
    validateWebhookDraft,
    webhookErrorMessages,
    validatePacProxyString,
    validateDomainRules,
  };
}
