/** Shared parsing and validation primitives for proxy connectivity checks. */
export class ProxyProbeError extends Error {
  constructor(
    readonly code: string,
    readonly detail = ""
  ) {
    super(code);
    this.name = "ProxyProbeError";
  }
}

export interface ProxyProbeWarning {
  code: string;
  detail: string;
}

/** Validate an administrator-configured HTTPS test URL before opening a proxy tunnel. */
export function parseProxyTestUrl(raw: string): URL {
  const value = String(raw ?? "").trim();
  if (!value) throw new ProxyProbeError("monitor.probeErrors.urlRequired");
  if (/[\u0000-\u0020\u007f]/.test(value))
    throw new ProxyProbeError("monitor.probeErrors.urlWhitespace");

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ProxyProbeError("monitor.probeErrors.urlInvalid");
  }
  if (url.protocol !== "https:") throw new ProxyProbeError("monitor.probeErrors.urlHttpsOnly");
  if (!url.hostname || url.username || url.password)
    throw new ProxyProbeError("monitor.probeErrors.urlCredentials");
  if (url.hash) throw new ProxyProbeError("monitor.probeErrors.urlFragment");
  return url;
}

export type ProxyKind = "PROXY" | "HTTP" | "HTTPS" | "SOCKS" | "SOCKS4" | "SOCKS4A" | "SOCKS5";

export interface ProxyCandidate {
  kind: ProxyKind;
  host: string;
  port: number;
  username?: string;
  password?: string;
}


export function parsePacProxy(raw: string): {
  candidates: ProxyCandidate[];
  ignoredDirectEntries: number;
  warnings: ProxyProbeWarning[];
} {
  const candidates: ProxyCandidate[] = [];
  const warnings: ProxyProbeWarning[] = [];
  let ignoredDirectEntries = 0;
  const pieces = raw
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);

  for (const piece of pieces) {
    if (/^DIRECT$/i.test(piece)) {
      ignoredDirectEntries += 1;
      continue;
    }

    const match = /^(PROXY|HTTP|HTTPS|SOCKS|SOCKS4|SOCKS4A|SOCKS5)\s+(.+)$/i.exec(piece);
    if (!match) {
      const detail = piece.slice(0, 80);
      warnings.push({
        code: "monitor.probeErrors.unrecognizedEntry",
        detail,
      });
      continue;
    }

    const kind = match[1].toUpperCase() as ProxyKind;
    try {
      const candidate = parseProxyAddress(kind, match[2].trim());
      const key = [candidate.kind, candidate.host.toLowerCase(), candidate.port].join("|");
      if (
        !candidates.some(
          (existing) =>
            [existing.kind, existing.host.toLowerCase(), existing.port].join("|") === key
        )
      )
        candidates.push(candidate);
    } catch (error) {
      if (error instanceof ProxyProbeError) {
        warnings.push({
          code: error.code,
          detail: error.detail,
        });
      } else {
        warnings.push({
          code: "",
          detail:
            error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200),
        });
      }
    }
  }

  if (pieces.length === 0) {
    warnings.push({ code: "monitor.probeErrors.proxyStringEmpty", detail: "" });
  }
  if (candidates.length === 0 && warnings.length === 0) {
    warnings.push({ code: "monitor.probeErrors.onlyDirect", detail: "" });
  }
  return { candidates, ignoredDirectEntries, warnings };
}

function parseProxyAddress(kind: ProxyKind, rawAddress: string): ProxyCandidate {
  let address = rawAddress;
  let username: string | undefined;
  let password: string | undefined;

  if (/^[a-z][a-z\d+.-]*:\/\//i.test(address)) {
    const url = new URL(address);
    address = url.host;
    username = url.username ? decodeURIComponent(url.username) : undefined;
    password = url.password ? decodeURIComponent(url.password) : undefined;
  } else {
    const at = address.lastIndexOf("@");
    if (at >= 0) {
      const credentials = address.slice(0, at);
      address = address.slice(at + 1);
      const separator = credentials.indexOf(":");
      if (separator <= 0) throw new ProxyProbeError("monitor.probeErrors.proxyAuthFormat");
      username = decodeURIComponent(credentials.slice(0, separator));
      password = decodeURIComponent(credentials.slice(separator + 1));
    }
  }

  let host = "";
  let portText = "";
  if (address.startsWith("[")) {
    const match = /^\[([^\]]+)\]:(\d+)$/.exec(address);
    if (!match) throw new ProxyProbeError("monitor.probeErrors.proxyIpv6Format");
    host = match[1];
    portText = match[2];
  } else {
    const separator = address.lastIndexOf(":");
    if (separator <= 0)
      throw new ProxyProbeError("monitor.probeErrors.proxyPortMissing", address.slice(0, 100));
    host = address.slice(0, separator);
    portText = address.slice(separator + 1);
  }

  const port = Number(portText);
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ProxyProbeError("monitor.probeErrors.proxyAddressInvalid", address.slice(0, 100));
  }

  return { kind, host, port, username, password };
}


export function formatHostPort(host: string, port: number): string {
  return (host.includes(":") && !host.startsWith("[") ? "[" + host + "]" : host) + ":" + port;
}

export function isLoopbackHost(host: string): boolean {
  const normalized = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized === "localhost" || normalized === "::1" || normalized === "0:0:0:0:0:0:0:1")
    return true;
  const parts = normalized.split(".");
  return (
    parts.length === 4 &&
    Number(parts[0]) === 127 &&
    parts.every((part) => /^\d+$/.test(part) && Number(part) >= 0 && Number(part) <= 255)
  );
}

