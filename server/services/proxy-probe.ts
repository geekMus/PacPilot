import net, { isIP, type Socket } from "node:net";
import dns from "node:dns/promises";
import tls, { type TLSSocket } from "node:tls";
import type { Duplex } from "node:stream";
import { performance } from "node:perf_hooks";
import type { AppDatabase } from "../db/sqlite";
import { recordProxyProbe, type ProxyProbeInput } from "../db/monitoring";

export const DEFAULT_PROXY_TEST_URL = "https://www.google.com/generate_204";

/** Validate an administrator-configured HTTPS test URL before opening a proxy tunnel. */
export function parseProxyTestUrl(raw: string): URL {
  const value = String(raw ?? "").trim();
  if (!value) throw new Error("代理测试地址不能为空。");
  if (/[\u0000-\u0020\u007f]/.test(value)) throw new Error("代理测试地址不能包含空白字符或控制字符；请检查 URL 编码。");

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("代理测试地址格式无效，请填写完整的 HTTPS URL，例如 https://www.google.com/generate_204。");
  }
  if (url.protocol !== "https:") throw new Error("代理测试地址目前只支持 HTTPS URL。");
  if (!url.hostname || url.username || url.password) throw new Error("代理测试地址必须包含主机名，且不能包含用户名或密码。");
  if (url.hash) throw new Error("代理测试地址不能包含 URL 片段（# 后的内容）。");
  return url;
}
const MAX_PROXIES_PER_RUN = 5;
const CONNECT_TIMEOUT_MS = 3500;
const IO_TIMEOUT_MS = 4500;

type ProxyKind = "PROXY" | "HTTP" | "HTTPS" | "SOCKS" | "SOCKS4" | "SOCKS4A" | "SOCKS5";

interface ProxyCandidate {
  kind: ProxyKind;
  host: string;
  port: number;
  username?: string;
  password?: string;
}

export interface ProxyProbeResult {
  testedAt: string;
  proxyLabel: string;
  proxyHost: string;
  proxyPort: number;
  targetHost: string;
  success: boolean;
  tcpMs: number | null;
  handshakeMs: number | null;
  targetMs: number | null;
  httpStatus: number | null;
  phase: string;
  error: string;
  isLoopback: boolean;
}

export interface ProxyProbeBatch {
  targetUrl: string;
  targetHost: string;
  targetPort: number;
  results: ProxyProbeResult[];
  ignoredDirectEntries: number;
  parseWarnings: string[];
  limited: boolean;
}

export async function testConfiguredProxies(
  database: AppDatabase,
  pacProxy: string,
  targetUrlRaw = DEFAULT_PROXY_TEST_URL
): Promise<ProxyProbeBatch> {
  const targetUrl = parseProxyTestUrl(targetUrlRaw);
  const targetHost = targetUrl.hostname.replace(/^\[|\]$/g, "");
  const targetPort = Number(targetUrl.port || "443");
  const targetPath = (targetUrl.pathname || "/") + targetUrl.search;
  const parsed = parsePacProxy(pacProxy);
  if (parsed.candidates.length === 0) {
    throw new Error(parsed.warnings[0] || "PAC 代理字符串中没有可测试的代理指令；DIRECT 不需要进行代理连通性检测。");
  }

  const candidates = parsed.candidates.slice(0, MAX_PROXIES_PER_RUN);
  const results = await Promise.all(candidates.map((candidate) => probeCandidate(candidate, targetUrl, targetHost, targetPort, targetPath)));
  for (const result of results) {
    const item: ProxyProbeInput = {
      tested_at: result.testedAt,
      proxy_label: result.proxyLabel,
      proxy_host: result.proxyHost,
      proxy_port: result.proxyPort,
      target_host: result.targetHost,
      success: result.success,
      tcp_ms: result.tcpMs,
      handshake_ms: result.handshakeMs,
      target_ms: result.targetMs,
      http_status: result.httpStatus,
      phase: result.phase,
      error: result.error,
    };
    recordProxyProbe(database, item);
  }

  return {
    targetUrl: targetUrl.toString(),
    targetHost,
    targetPort,
    results,
    ignoredDirectEntries: parsed.ignoredDirectEntries,
    parseWarnings: parsed.warnings,
    limited: parsed.candidates.length > MAX_PROXIES_PER_RUN,
  };
}

function parsePacProxy(raw: string): {
  candidates: ProxyCandidate[];
  ignoredDirectEntries: number;
  warnings: string[];
} {
  const candidates: ProxyCandidate[] = [];
  const warnings: string[] = [];
  let ignoredDirectEntries = 0;
  const pieces = raw.split(";").map((part) => part.trim()).filter(Boolean);

  for (const piece of pieces) {
    if (/^DIRECT$/i.test(piece)) {
      ignoredDirectEntries += 1;
      continue;
    }

    const match = /^(PROXY|HTTP|HTTPS|SOCKS|SOCKS4|SOCKS4A|SOCKS5)\s+(.+)$/i.exec(piece);
    if (!match) {
      warnings.push("无法识别的 PAC 代理条目：" + piece.slice(0, 80));
      continue;
    }

    const kind = match[1].toUpperCase() as ProxyKind;
    try {
      const candidate = parseProxyAddress(kind, match[2].trim());
      const key = [candidate.kind, candidate.host.toLowerCase(), candidate.port].join("|");
      if (!candidates.some((existing) =>
        [existing.kind, existing.host.toLowerCase(), existing.port].join("|") === key
      )) candidates.push(candidate);
    } catch (error) {
      warnings.push((error instanceof Error ? error.message : String(error)).slice(0, 200));
    }
  }

  if (pieces.length === 0) warnings.push("PAC 代理字符串为空。");
  if (candidates.length === 0 && warnings.length === 0) {
    warnings.push("PAC 代理字符串中只有 DIRECT，没有可测试的代理节点。");
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
      if (separator <= 0) throw new Error("代理认证信息格式无效，请使用 username:password@host:port。");
      username = decodeURIComponent(credentials.slice(0, separator));
      password = decodeURIComponent(credentials.slice(separator + 1));
    }
  }

  let host = "";
  let portText = "";
  if (address.startsWith("[")) {
    const match = /^\[([^\]]+)\]:(\d+)$/.exec(address);
    if (!match) throw new Error("IPv6 代理地址必须使用 [地址]:端口 格式。");
    host = match[1];
    portText = match[2];
  } else {
    const separator = address.lastIndexOf(":");
    if (separator <= 0) throw new Error("代理地址缺少端口：" + address.slice(0, 100));
    host = address.slice(0, separator);
    portText = address.slice(separator + 1);
  }

  const port = Number(portText);
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("代理地址或端口无效：" + address.slice(0, 100));
  }

  return { kind, host, port, username, password };
}

async function probeCandidate(candidate: ProxyCandidate, targetUrl: URL, targetHost: string, targetPort: number, targetPath: string): Promise<ProxyProbeResult> {
  const testedAt = new Date().toISOString();
  const label = candidate.kind + " " + formatHostPort(candidate.host, candidate.port);
  let socket: Socket | null = null;
  let proxyTls: TLSSocket | null = null;
  let targetTls: TLSSocket | null = null;
  let tcpMs: number | null = null;
  let handshakeMs: number | null = null;
  let targetMs: number | null = null;
  let tcpStarted: number | null = null;
  let handshakeStarted: number | null = null;
  let targetStarted: number | null = null;
  let httpStatus: number | null = null;
  let phase = "TCP";
  let error = "";
  let success = false;
  let overallTimeoutExpired = false;
  const deadlineTimer = setTimeout(() => {
    overallTimeoutExpired = true;
    try { targetTls?.destroy(); } catch { /* ignore cleanup errors */ }
    try { proxyTls?.destroy(); } catch { /* ignore cleanup errors */ }
    try { socket?.destroy(); } catch { /* ignore cleanup errors */ }
  }, 12000);

  try {
    tcpStarted = performance.now();
    socket = await connectTcp(candidate.host, candidate.port, CONNECT_TIMEOUT_MS);
    tcpMs = roundedMs(performance.now() - tcpStarted);

    handshakeStarted = performance.now();
    let proxyChannel: Duplex = socket;
    if (candidate.kind === "HTTPS") {
      phase = "PROXY_TLS";
      proxyTls = await connectTls(socket, candidate.host, IO_TIMEOUT_MS);
      proxyChannel = proxyTls;
    }

    phase = "PROXY_HANDSHAKE";
    await establishProxyTunnel(candidate, proxyChannel, targetHost, targetPort);
    handshakeMs = roundedMs(performance.now() - handshakeStarted);

    targetStarted = performance.now();
    phase = "TARGET_TLS";
    targetTls = await connectTls(proxyChannel, targetHost, IO_TIMEOUT_MS);

    phase = "TARGET_HTTP";
    const headersPromise = readHttpHeader(targetTls, IO_TIMEOUT_MS);
    targetTls.write(
      "GET " + targetPath + " HTTP/1.1\r\n" +
      "Host: " + targetUrl.host + "\r\n" +
      "User-Agent: genpac-runner-monitor\r\n" +
      "Accept: */*\r\n" +
      "Connection: close\r\n\r\n"
    );
    const responseHeader = await headersPromise;
    const statusMatch = /^HTTP\/\d(?:\.\d)?\s+(\d{3})/i.exec(responseHeader);
    if (!statusMatch) throw new Error("目标站点返回了无法识别的 HTTP 响应。");
    httpStatus = Number(statusMatch[1]);
    targetMs = roundedMs(performance.now() - targetStarted);
    if (httpStatus >= 400) {
      throw new Error("目标站点返回 HTTP " + httpStatus + "。代理隧道和 TLS 已建立，但目标请求未成功。");
    }
    phase = "complete";
    success = true;
  } catch (caught) {
    error = overallTimeoutExpired
      ? "单个代理的检测总耗时超过 12 秒，已终止。"
      : readableError(caught);
    if (tcpMs === null && tcpStarted !== null && phase === "TCP") {
      tcpMs = roundedMs(performance.now() - tcpStarted);
    }
    if (handshakeMs === null && handshakeStarted !== null &&
        (phase === "PROXY_TLS" || phase === "PROXY_HANDSHAKE")) {
      handshakeMs = roundedMs(performance.now() - handshakeStarted);
    }
    if (targetMs === null && targetStarted !== null && phase.startsWith("TARGET")) {
      targetMs = roundedMs(performance.now() - targetStarted);
    }
  } finally {
    clearTimeout(deadlineTimer);
    try { targetTls?.destroy(); } catch { /* ignore cleanup errors */ }
    if (proxyTls && proxyTls !== targetTls) {
      try { proxyTls.destroy(); } catch { /* ignore cleanup errors */ }
    }
    if (socket && socket !== proxyTls && socket !== targetTls) {
      try { socket.destroy(); } catch { /* ignore cleanup errors */ }
    }
  }

  return {
    testedAt,
    proxyLabel: label,
    proxyHost: candidate.host,
    proxyPort: candidate.port,
    targetHost: formatHostPort(targetHost, targetPort),
    success,
    tcpMs,
    handshakeMs,
    targetMs,
    httpStatus,
    phase,
    error,
    isLoopback: isLoopbackHost(candidate.host),
  };
}

function establishProxyTunnel(
  candidate: ProxyCandidate,
  socket: Duplex,
  targetHost: string,
  targetPort: number
): Promise<void> {
  if (candidate.kind === "SOCKS4A") {
    return establishSocks4aTunnel(socket, targetHost, targetPort);
  }
  if (candidate.kind === "SOCKS" || candidate.kind === "SOCKS4") {
    return establishSocks4Tunnel(socket, targetHost, targetPort);
  }
  if (candidate.kind === "SOCKS5") {
    return establishSocks5Tunnel(socket, candidate, targetHost, targetPort);
  }
  return establishHttpConnectTunnel(socket, candidate, targetHost, targetPort);
}

async function establishHttpConnectTunnel(
  socket: Duplex,
  candidate: ProxyCandidate,
  targetHost: string,
  targetPort: number
): Promise<void> {
  const auth = candidate.username !== undefined
    ? "Proxy-Authorization: Basic " +
      Buffer.from(candidate.username + ":" + (candidate.password ?? ""), "utf8").toString("base64") + "\r\n"
    : "";
  const responsePromise = readHttpHeader(socket, IO_TIMEOUT_MS);
  const targetAuthority = formatHostPort(targetHost, targetPort);
  socket.write(
    "CONNECT " + targetAuthority + " HTTP/1.1\r\n" +
    "Host: " + targetAuthority + "\r\n" +
    "Proxy-Connection: Keep-Alive\r\n" + auth + "\r\n"
  );
  const response = await responsePromise;
  const match = /^HTTP\/\d(?:\.\d)?\s+(\d{3})/i.exec(response);
  if (!match) throw new Error("代理未返回有效的 HTTP CONNECT 状态行。");
  const status = Number(match[1]);
  if (status < 200 || status >= 300) {
    throw new Error("代理 CONNECT 返回 HTTP " + status + "。");
  }
}

async function establishSocks5Tunnel(
  socket: Duplex,
  candidate: ProxyCandidate,
  targetHost: string,
  targetPort: number
): Promise<void> {
  const wantsAuth = candidate.username !== undefined;
  const greeting = wantsAuth ? Buffer.from([5, 1, 2]) : Buffer.from([5, 1, 0]);
  const greetingPromise = readExact(socket, 2, IO_TIMEOUT_MS);
  socket.write(greeting);
  const methodResponse = await greetingPromise;
  if (methodResponse[0] !== 5) throw new Error("SOCKS5 握手版本不正确。");

  if (methodResponse[1] === 2 && wantsAuth) {
    const username = Buffer.from(candidate.username ?? "", "utf8");
    const password = Buffer.from(candidate.password ?? "", "utf8");
    if (username.length > 255 || password.length > 255) throw new Error("SOCKS5 用户名或密码过长。");
    const authPacket = Buffer.concat([
      Buffer.from([1, username.length]), username,
      Buffer.from([password.length]), password,
    ]);
    const authPromise = readExact(socket, 2, IO_TIMEOUT_MS);
    socket.write(authPacket);
    const authResponse = await authPromise;
    if (authResponse[0] !== 1 || authResponse[1] !== 0) {
      throw new Error("SOCKS5 用户名或密码认证失败。");
    }
  } else if (methodResponse[1] !== 0) {
    throw new Error(methodResponse[1] === 2
      ? "SOCKS5 代理要求用户名/密码，但配置中未提供认证信息。"
      : "SOCKS5 代理没有接受支持的认证方式（method " + methodResponse[1] + "）。");
  }

  const domain = Buffer.from(targetHost, "ascii");
  if (domain.length > 255) throw new Error("测试目标域名过长。");
  const request = Buffer.concat([
    Buffer.from([5, 1, 0, 3, domain.length]),
    domain,
    Buffer.from([(targetPort >> 8) & 255, targetPort & 255]),
  ]);
  const replyPromise = readSocks5Reply(socket, IO_TIMEOUT_MS);
  socket.write(request);
  const reply = await replyPromise;
  if (reply[0] !== 5) throw new Error("SOCKS5 代理返回了无效响应。");
  if (reply[1] !== 0) {
    const reasons: Record<number, string> = {
      1: "一般失败", 2: "规则不允许连接", 3: "网络不可达", 4: "目标主机不可达",
      5: "目标连接被拒绝", 6: "TTL 超时", 7: "不支持的命令", 8: "不支持的地址类型",
    };
    throw new Error("SOCKS5 目标连接失败：" + (reasons[reply[1]] || "错误码 " + reply[1]) + "。");
  }
  if (![1, 3, 4].includes(reply[3])) throw new Error("SOCKS5 响应使用了未知地址类型。");
}

async function establishSocks4Tunnel(
  socket: Duplex,
  targetHost: string,
  targetPort: number
): Promise<void> {
  // SOCKS4 只接收 IPv4 地址；目标域名由检测所在的主机/容器先解析。
  let address: string;
  try {
    const resolved = await dns.lookup(targetHost, { family: 4 });
    address = resolved.address;
  } catch {
    throw new Error("检测环境无法将目标域名解析为 IPv4，无法进行 SOCKS4 测试。");
  }
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    throw new Error("目标 DNS 未返回有效的 IPv4 地址，无法进行 SOCKS4 测试。");
  }
  const userId = Buffer.from("genpac-runner", "ascii");
  const request = Buffer.concat([
    Buffer.from([4, 1, (targetPort >> 8) & 255, targetPort & 255, ...octets]),
    userId,
    Buffer.from([0]),
  ]);
  const replyPromise = readExact(socket, 8, IO_TIMEOUT_MS);
  socket.write(request);
  const reply = await replyPromise;
  if (reply[0] !== 0 && reply[0] !== 4) throw new Error("SOCKS4 代理返回了无效响应。");
  if (reply[1] !== 90) {
    const reasons: Record<number, string> = {
      91: "请求被拒绝或失败", 92: "无法连接到 identd", 93: "identd 用户不匹配",
    };
    throw new Error("SOCKS4 目标连接失败：" + (reasons[reply[1]] || "响应码 " + reply[1]) + "。");
  }
}

async function establishSocks4aTunnel(
  socket: Duplex,
  targetHost: string,
  targetPort: number
): Promise<void> {
  // SOCKS4a 把域名交给代理端解析。
  const userId = Buffer.from("genpac-runner", "ascii");
  const domain = Buffer.from(targetHost, "ascii");
  const request = Buffer.concat([
    Buffer.from([4, 1, (targetPort >> 8) & 255, targetPort & 255, 0, 0, 0, 1]),
    userId,
    Buffer.from([0]),
    domain,
    Buffer.from([0]),
  ]);
  const replyPromise = readExact(socket, 8, IO_TIMEOUT_MS);
  socket.write(request);
  const reply = await replyPromise;
  if (reply[0] !== 0 && reply[0] !== 4) throw new Error("SOCKS4a 代理返回了无效响应。");
  if (reply[1] !== 90) {
    const reasons: Record<number, string> = {
      91: "请求被拒绝或失败", 92: "无法连接到 identd", 93: "identd 用户不匹配",
    };
    throw new Error("SOCKS4a 目标连接失败：" + (reasons[reply[1]] || "响应码 " + reply[1]) + "。");
  }
}

function connectTcp(host: string, port: number, timeoutMs: number): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(new Error("连接代理端口超时。"));
    }, timeoutMs);
    const cleanup = (): void => {
      clearTimeout(timer);
      socket.removeListener("connect", onConnect);
      socket.removeListener("error", onError);
    };
    const onConnect = (): void => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(socket);
    };
    const onError = (error: Error): void => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("无法连接代理端口：" + error.message));
    };
    socket.once("connect", onConnect);
    socket.once("error", onError);
  });
}

function connectTls(socket: Duplex, servername: string, timeoutMs: number): Promise<TLSSocket> {
  return new Promise((resolve, reject) => {
    const options: tls.ConnectionOptions = {
      socket: socket as Socket,
      rejectUnauthorized: true,
    };
    if (isIP(servername) === 0) options.servername = servername;
    const secureSocket = tls.connect(options);
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      secureSocket.destroy();
      reject(new Error("TLS 握手超时。"));
    }, timeoutMs);
    const cleanup = (): void => {
      clearTimeout(timer);
      secureSocket.removeListener("secureConnect", onSecure);
      secureSocket.removeListener("error", onError);
    };
    const onSecure = (): void => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(secureSocket);
    };
    const onError = (error: Error): void => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("TLS 握手失败：" + error.message));
    };
    secureSocket.once("secureConnect", onSecure);
    secureSocket.once("error", onError);
  });
}

function readSocks5Reply(socket: Duplex, timeoutMs: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    let received = Buffer.alloc(0);
    let expected = 4;
    let settled = false;
    const timer = setTimeout(() => finish(new Error("等待 SOCKS5 目标连接响应超时。")), timeoutMs);
    const cleanup = (): void => {
      clearTimeout(timer);
      socket.removeListener("data", onData);
      socket.removeListener("error", onError);
      socket.removeListener("close", onClose);
    };
    const finish = (error?: Error, value?: Buffer): void => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve(value ?? Buffer.alloc(0));
    };
    const onData = (chunk: Buffer | string): void => {
      received = Buffer.concat([received, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
      if (received.length >= 4 && expected === 4) {
        if (received[3] === 1) expected = 10;
        else if (received[3] === 4) expected = 22;
        else if (received[3] === 3) expected = received.length >= 5 ? 7 + received[4] : 5;
        else expected = 4;
      }
      if (received.length >= 5 && received[3] === 3 && expected === 5) expected = 7 + received[4];
      if (received.length >= expected) finish(undefined, received.subarray(0, expected));
    };
    const onError = (error: Error): void => finish(new Error("SOCKS5 连接中断：" + error.message));
    const onClose = (): void => finish(new Error("SOCKS5 代理在返回完整响应前关闭了连接。"));
    socket.on("data", onData);
    socket.once("error", onError);
    socket.once("close", onClose);
  });
}

function readExact(socket: Duplex, count: number, timeoutMs: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    let received = Buffer.alloc(0);
    let settled = false;
    const timer = setTimeout(() => finish(new Error("等待代理响应超时。")), timeoutMs);
    const cleanup = (): void => {
      clearTimeout(timer);
      socket.removeListener("data", onData);
      socket.removeListener("error", onError);
      socket.removeListener("close", onClose);
    };
    const finish = (error?: Error, value?: Buffer): void => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve(value ?? Buffer.alloc(0));
    };
    const onData = (chunk: Buffer | string): void => {
      received = Buffer.concat([received, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
      if (received.length >= count) finish(undefined, received.subarray(0, count));
    };
    const onError = (error: Error): void => finish(new Error("代理连接中断：" + error.message));
    const onClose = (): void => finish(new Error("代理在返回完整响应前关闭了连接。"));
    socket.on("data", onData);
    socket.once("error", onError);
    socket.once("close", onClose);
  });
}

function readHttpHeader(socket: Duplex, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let received = Buffer.alloc(0);
    let settled = false;
    const timer = setTimeout(() => finish(new Error("等待 HTTP 响应头超时。")), timeoutMs);
    const cleanup = (): void => {
      clearTimeout(timer);
      socket.removeListener("data", onData);
      socket.removeListener("error", onError);
      socket.removeListener("close", onClose);
    };
    const finish = (error?: Error, value?: string): void => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve(value ?? "");
    };
    const onData = (chunk: Buffer | string): void => {
      received = Buffer.concat([received, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
      if (received.length > 16 * 1024) {
        finish(new Error("HTTP 响应头超过 16 KiB，已终止检测。"));
        return;
      }
      const index = received.indexOf("\r\n\r\n");
      if (index >= 0) finish(undefined, received.subarray(0, index).toString("utf8"));
    };
    const onError = (error: Error): void => finish(new Error("读取 HTTP 响应失败：" + error.message));
    const onClose = (): void => finish(new Error("连接在返回 HTTP 响应头前关闭。"));
    socket.on("data", onData);
    socket.once("error", onError);
    socket.once("close", onClose);
  });
}

function formatHostPort(host: string, port: number): string {
  return (host.includes(":") && !host.startsWith("[") ? "[" + host + "]" : host) + ":" + port;
}

function isLoopbackHost(host: string): boolean {
  const normalized = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized === "localhost" || normalized === "::1" || normalized === "0:0:0:0:0:0:0:1") return true;
  const parts = normalized.split(".");
  return parts.length === 4 && Number(parts[0]) === 127 &&
    parts.every((part) => /^\d+$/.test(part) && Number(part) >= 0 && Number(part) <= 255);
}

function roundedMs(value: number): number {
  return Math.round(value * 10) / 10;
}

function readableError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/[\r\n\t]/g, " ").slice(0, 300);
}
