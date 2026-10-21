import net, { isIP, type Socket } from "node:net";
import dns from "node:dns/promises";
import tls, { type TLSSocket } from "node:tls";
import type { Duplex } from "node:stream";
import { performance } from "node:perf_hooks";
import type { AppDatabase } from "../db/sqlite";
import { recordProxyProbe, type ProxyProbeInput } from "../db/monitoring";
import {
  formatHostPort,
  isLoopbackHost,
  parsePacProxy,
  parseProxyTestUrl,
  ProxyProbeError,
  type ProxyCandidate,
  type ProxyProbeWarning,
} from "./proxy-probe-parser";
export { ProxyProbeError, parseProxyTestUrl } from "./proxy-probe-parser";

export const DEFAULT_PROXY_TEST_URL = "https://www.google.com/generate_204";

const MAX_PROXIES_PER_RUN = 5;
const CONNECT_TIMEOUT_MS = 3500;
const IO_TIMEOUT_MS = 4500;

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
  errorCode: string;
  errorDetail: string;
  isLoopback: boolean;
}

export interface ProxyProbeBatch {
  targetUrl: string;
  targetHost: string;
  targetPort: number;
  results: ProxyProbeResult[];
  ignoredDirectEntries: number;
  parseWarnings: ProxyProbeWarning[];
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
    const warning = parsed.warnings[0];
    throw new ProxyProbeError(warning?.code ?? "monitor.probeErrors.noProxyNodes", warning?.detail);
  }

  const candidates = parsed.candidates.slice(0, MAX_PROXIES_PER_RUN);
  const results = await Promise.all(
    candidates.map((candidate) =>
      probeCandidate(candidate, targetUrl, targetHost, targetPort, targetPath)
    )
  );
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
      error_code: result.errorCode,
      error_detail: result.errorDetail,
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

async function probeCandidate(
  candidate: ProxyCandidate,
  targetUrl: URL,
  targetHost: string,
  targetPort: number,
  targetPath: string
): Promise<ProxyProbeResult> {
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
  let errorCode = "";
  let errorDetail = "";
  let success = false;
  let overallTimeoutExpired = false;
  const deadlineTimer = setTimeout(() => {
    overallTimeoutExpired = true;
    try {
      targetTls?.destroy();
    } catch {
      /* ignore cleanup errors */
    }
    try {
      proxyTls?.destroy();
    } catch {
      /* ignore cleanup errors */
    }
    try {
      socket?.destroy();
    } catch {
      /* ignore cleanup errors */
    }
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
      "GET " +
        targetPath +
        " HTTP/1.1\r\n" +
        "Host: " +
        targetUrl.host +
        "\r\n" +
        "User-Agent: genpac-runner-monitor\r\n" +
        "Accept: */*\r\n" +
        "Connection: close\r\n\r\n"
    );
    const responseHeader = await headersPromise;
    const statusMatch = /^HTTP\/\d(?:\.\d)?\s+(\d{3})/i.exec(responseHeader);
    if (!statusMatch) throw new ProxyProbeError("monitor.probeErrors.targetHttpInvalid");
    httpStatus = Number(statusMatch[1]);
    targetMs = roundedMs(performance.now() - targetStarted);
    if (httpStatus >= 400) {
      throw new ProxyProbeError("monitor.probeErrors.targetHttpStatus", String(httpStatus));
    }
    phase = "complete";
    success = true;
  } catch (caught) {
    if (overallTimeoutExpired) {
      errorCode = "monitor.probeErrors.totalTimeout";
    } else if (caught instanceof ProxyProbeError) {
      errorCode = caught.code;
      errorDetail = caught.detail;
    } else {
      errorDetail = readableError(caught);
    }
    if (tcpMs === null && tcpStarted !== null && phase === "TCP") {
      tcpMs = roundedMs(performance.now() - tcpStarted);
    }
    if (
      handshakeMs === null &&
      handshakeStarted !== null &&
      (phase === "PROXY_TLS" || phase === "PROXY_HANDSHAKE")
    ) {
      handshakeMs = roundedMs(performance.now() - handshakeStarted);
    }
    if (targetMs === null && targetStarted !== null && phase.startsWith("TARGET")) {
      targetMs = roundedMs(performance.now() - targetStarted);
    }
  } finally {
    clearTimeout(deadlineTimer);
    try {
      targetTls?.destroy();
    } catch {
      /* ignore cleanup errors */
    }
    if (proxyTls && proxyTls !== targetTls) {
      try {
        proxyTls.destroy();
      } catch {
        /* ignore cleanup errors */
      }
    }
    if (socket && socket !== proxyTls && socket !== targetTls) {
      try {
        socket.destroy();
      } catch {
        /* ignore cleanup errors */
      }
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
    errorCode,
    errorDetail,
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
  const auth =
    candidate.username !== undefined
      ? "Proxy-Authorization: Basic " +
        Buffer.from(candidate.username + ":" + (candidate.password ?? ""), "utf8").toString(
          "base64"
        ) +
        "\r\n"
      : "";
  const responsePromise = readHttpHeader(socket, IO_TIMEOUT_MS);
  const targetAuthority = formatHostPort(targetHost, targetPort);
  socket.write(
    "CONNECT " +
      targetAuthority +
      " HTTP/1.1\r\n" +
      "Host: " +
      targetAuthority +
      "\r\n" +
      "Proxy-Connection: Keep-Alive\r\n" +
      auth +
      "\r\n"
  );
  const response = await responsePromise;
  const match = /^HTTP\/\d(?:\.\d)?\s+(\d{3})/i.exec(response);
  if (!match) throw new ProxyProbeError("monitor.probeErrors.connectStatusInvalid");
  const status = Number(match[1]);
  if (status < 200 || status >= 300) {
    throw new ProxyProbeError("monitor.probeErrors.connectHttpStatus", String(status));
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
  if (methodResponse[0] !== 5)
    throw new ProxyProbeError("monitor.probeErrors.socks5VersionInvalid");

  if (methodResponse[1] === 2 && wantsAuth) {
    const username = Buffer.from(candidate.username ?? "", "utf8");
    const password = Buffer.from(candidate.password ?? "", "utf8");
    if (username.length > 255 || password.length > 255)
      throw new ProxyProbeError("monitor.probeErrors.socks5CredentialsTooLong");
    const authPacket = Buffer.concat([
      Buffer.from([1, username.length]),
      username,
      Buffer.from([password.length]),
      password,
    ]);
    const authPromise = readExact(socket, 2, IO_TIMEOUT_MS);
    socket.write(authPacket);
    const authResponse = await authPromise;
    if (authResponse[0] !== 1 || authResponse[1] !== 0) {
      throw new ProxyProbeError("monitor.probeErrors.socks5AuthFailed");
    }
  } else if (methodResponse[1] !== 0) {
    throw new ProxyProbeError(
      methodResponse[1] === 2
        ? "monitor.probeErrors.socks5AuthRequired"
        : "monitor.probeErrors.socks5AuthMethodUnsupported",
      methodResponse[1] === 2 ? "" : String(methodResponse[1])
    );
  }

  const domain = Buffer.from(targetHost, "ascii");
  if (domain.length > 255) throw new ProxyProbeError("monitor.probeErrors.targetDomainTooLong");
  const request = Buffer.concat([
    Buffer.from([5, 1, 0, 3, domain.length]),
    domain,
    Buffer.from([(targetPort >> 8) & 255, targetPort & 255]),
  ]);
  const replyPromise = readSocks5Reply(socket, IO_TIMEOUT_MS);
  socket.write(request);
  const reply = await replyPromise;
  if (reply[0] !== 5) throw new ProxyProbeError("monitor.probeErrors.socks5ResponseInvalid");
  if (reply[1] !== 0) {
    throw new ProxyProbeError("monitor.probeErrors.socks5ConnectFailed", String(reply[1]));
  }
  if (![1, 3, 4].includes(reply[3]))
    throw new ProxyProbeError("monitor.probeErrors.socks5AddressTypeUnknown");
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
    throw new ProxyProbeError("monitor.probeErrors.socks4DnsFailed");
  }
  const octets = address.split(".").map(Number);
  if (
    octets.length !== 4 ||
    octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    throw new ProxyProbeError("monitor.probeErrors.socks4DnsInvalid");
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
  if (reply[0] !== 0 && reply[0] !== 4)
    throw new ProxyProbeError("monitor.probeErrors.socks4ResponseInvalid");
  if (reply[1] !== 90) {
    throw new ProxyProbeError("monitor.probeErrors.socks4ConnectFailed", String(reply[1]));
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
  if (reply[0] !== 0 && reply[0] !== 4)
    throw new ProxyProbeError("monitor.probeErrors.socks4aResponseInvalid");
  if (reply[1] !== 90) {
    throw new ProxyProbeError("monitor.probeErrors.socks4aConnectFailed", String(reply[1]));
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
      reject(new ProxyProbeError("monitor.probeErrors.tcpTimeout"));
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
      reject(new ProxyProbeError("monitor.probeErrors.tcpFailed", error.message));
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
      reject(new ProxyProbeError("monitor.probeErrors.tlsTimeout"));
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
      reject(new ProxyProbeError("monitor.probeErrors.tlsFailed", error.message));
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
    const timer = setTimeout(
      () => finish(new ProxyProbeError("monitor.probeErrors.socks5ResponseTimeout")),
      timeoutMs
    );
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
    const onError = (error: Error): void =>
      finish(new ProxyProbeError("monitor.probeErrors.socks5ConnectionInterrupted", error.message));
    const onClose = (): void =>
      finish(new ProxyProbeError("monitor.probeErrors.socks5ConnectionClosed"));
    socket.on("data", onData);
    socket.once("error", onError);
    socket.once("close", onClose);
  });
}

function readExact(socket: Duplex, count: number, timeoutMs: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    let received = Buffer.alloc(0);
    let settled = false;
    const timer = setTimeout(
      () => finish(new ProxyProbeError("monitor.probeErrors.proxyResponseTimeout")),
      timeoutMs
    );
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
    const onError = (error: Error): void =>
      finish(new ProxyProbeError("monitor.probeErrors.proxyConnectionInterrupted", error.message));
    const onClose = (): void =>
      finish(new ProxyProbeError("monitor.probeErrors.proxyConnectionClosed"));
    socket.on("data", onData);
    socket.once("error", onError);
    socket.once("close", onClose);
  });
}

function readHttpHeader(socket: Duplex, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let received = Buffer.alloc(0);
    let settled = false;
    const timer = setTimeout(
      () => finish(new ProxyProbeError("monitor.probeErrors.httpHeaderTimeout")),
      timeoutMs
    );
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
        finish(new ProxyProbeError("monitor.probeErrors.httpHeaderTooLarge"));
        return;
      }
      const index = received.indexOf("\r\n\r\n");
      if (index >= 0) finish(undefined, received.subarray(0, index).toString("utf8"));
    };
    const onError = (error: Error): void =>
      finish(new ProxyProbeError("monitor.probeErrors.httpReadFailed", error.message));
    const onClose = (): void =>
      finish(new ProxyProbeError("monitor.probeErrors.httpHeaderConnectionClosed"));
    socket.on("data", onData);
    socket.once("error", onError);
    socket.once("close", onClose);
  });
}

function roundedMs(value: number): number {
  return Math.round(value * 10) / 10;
}

function readableError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/[\r\n\t]/g, " ").slice(0, 300);
}
