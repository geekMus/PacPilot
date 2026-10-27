import express from "express";
import cookieParser from "cookie-parser";
import compression from "compression";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { ApplicationStorage } from "./storage/repositories";
import type { EnvConfig } from "./config/env";
import { publicRoutes } from "./routes/public";
import { adminRoutes } from "./routes/admin";
import { requestMonitoringMiddleware } from "./services/request-monitor";
import { resumePendingNotificationDeliveries } from "./services/notifications";
import {
  getLocalInterfaceAddresses,
  isTrustedOrigin,
  normalizeOrigin,
} from "./utils/origin-policy";
import { configureClientIp } from "./utils/client-ip";
import { createSpaPreloads, injectPreloadTags, readInlineRuntimeConfig } from "./utils/spa-preload";

export function createApp(env: EnvConfig, storage: ApplicationStorage): express.Application {
  const app = express();
  void resumePendingNotificationDeliveries(storage);

  app.disable("x-powered-by");
  // Honour X-Forwarded-* from the configured number of proxy hops so Secure
  // cookies and client IPs are correct behind a reverse proxy or tunnel.
  app.set("trust proxy", env.trustProxyHops > 0 ? env.trustProxyHops : false);
  configureClientIp({
    trustProxyHops: env.trustProxyHops,
    trustCloudflare: env.trustCloudflareIp,
    trustedProxyCidrs: env.trustedProxyCidrs,
  });

  const openCors = env.corsMode === "open";
  const allowedMethods = "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS";

  // Explicit origins remain available for separately hosted frontends. Origins
  // using this host's current interface IPs are also recognized dynamically.
  const allowedOrigins = new Set(
    (process.env.CORS_ALLOWED_ORIGINS || "")
      .split(",")
      .map((origin) => normalizeOrigin(origin.trim()))
      .filter((origin): origin is string => Boolean(origin))
  );

  app.use((_req, res, next) => {
    const origin = _req.get("Origin");
    const normalizedOrigin = normalizeOrigin(origin);
    const requestOrigin = `${_req.protocol}://${_req.get("host")}`;
    // Re-read interfaces per request so address changes do not require a restart.
    const localAddresses = getLocalInterfaceAddresses();
    const trustedOrigin = isTrustedOrigin(origin, requestOrigin, allowedOrigins, localAddresses);
    const isAdminMutation =
      _req.path.startsWith("/api/admin/") && !["GET", "HEAD", "OPTIONS"].includes(_req.method);

    if (openCors) {
      // Any origin may call the API; admin access is authenticated by bearer
      // token only, so cookies are never involved and `*` stays valid.
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", allowedMethods);
      const requestedHeaders = _req.get("Access-Control-Request-Headers");
      res.setHeader(
        "Access-Control-Allow-Headers",
        requestedHeaders || "Authorization, Content-Type, Accept-Language"
      );
      res.setHeader("Access-Control-Max-Age", "600");
      if (requestedHeaders) res.vary("Access-Control-Request-Headers");
    } else {
      if (isAdminMutation && !trustedOrigin) {
        res.status(403).json({ error: "untrusted_origin" });
        return;
      }
      if (normalizedOrigin && trustedOrigin) {
        res.setHeader("Access-Control-Allow-Origin", normalizedOrigin);
        res.setHeader("Access-Control-Allow-Credentials", "true");
        res.setHeader("Access-Control-Allow-Methods", allowedMethods);
        const requestedHeaders = _req.get("Access-Control-Request-Headers");
        if (requestedHeaders) {
          res.setHeader("Access-Control-Allow-Headers", requestedHeaders);
          res.vary("Access-Control-Request-Headers");
        }
        res.vary("Origin");
      }
    }

    if (_req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    next();
  });

  app.use(requestMonitoringMiddleware(storage.monitoring));
  // 文本响应（HTML/JS/CSS/JSON/PAC）启用 gzip：静态资源原始体积约为压缩后的 3 倍，
  // 未压缩传输会显著拖慢弱网环境的首屏渲染。客户端不支持时自动跳过。
  app.use(compression());
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  // PAC 的规则集可能很小：默认配置没有任何规则时，产物只有 1KB 左右，而 compression()
  // 的默认阈值正好是 1KB，这类响应会被整段跳过压缩——表现出来就是「已经打开压缩 PAC，
  // 但访问 /pac 依然没有 Content-Encoding」。PAC 是机器读取的文本，任何体积都值得压缩，
  // 所以单独把它的阈值降到 0。与上面的中间件重叠挂载不会造成二次压缩：先决策的实例会
  // 写入 Content-Encoding，后一个实例据此判定「already encoded」后跳过。
  app.use("/pac", compression({ threshold: 0 }));
  app.use(publicRoutes(storage));
  app.use(adminRoutes(env, storage));

  const here =
    typeof import.meta.dir === "string"
      ? import.meta.dir
      : path.dirname(fileURLToPath(import.meta.url));
  const clientDir = path.resolve(here, "../dist/client");
  const indexHtml = path.join(clientDir, "index.html");

  if (fs.existsSync(clientDir)) {
    app.use(express.static(clientDir, { index: false, maxAge: "1h" }));
  }

  // 首屏要在入口脚本执行后才知道当前路由要下载哪个视图块，注入 <link rel=modulepreload>
  // 可以让这次下载与入口脚本并行，少等一次往返（见 utils/spa-preload.ts）。
  const spaPreloads = createSpaPreloads(clientDir);
  // 运行时配置直接内联：它是首屏第一个串行往返，而会话探测与首个 API 请求都必须等
  // 它解析完（config → session → 数据）。内联后这一跳消失，见 utils/spa-preload.ts。
  const inlineRuntimeConfig = readInlineRuntimeConfig(clientDir);
  let cachedIndexHtml: string | null = null;
  const renderSpa = (requestPath: string): string | null => {
    if (cachedIndexHtml === null) {
      cachedIndexHtml = fs.readFileSync(indexHtml, "utf8");
    }
    return injectPreloadTags(spaPreloads.renderHead(cachedIndexHtml, requestPath), inlineRuntimeConfig);
  };

  const sendSpa = (req: express.Request, res: express.Response) => {
    if (!fs.existsSync(indexHtml)) {
      res.status(503).type("text/plain").send("Frontend not built. Run: bun run build");
      return;
    }
    res.type("html").send(renderSpa(req.path));
  };

  // Vue SPA：首页与后台
  app.get("/", sendSpa);
  app.get("/admin", sendSpa);
  app.get(/^\/admin\/.*/, sendSpa);

  // 其余未知路径交给 SPA 的 404 页（返回 index，由前端路由展示 404）
  app.use((req, res) => {
    if (req.path.startsWith("/api/")) {
      res.status(404).json({ error: "Not Found" });
      return;
    }
    if (fs.existsSync(indexHtml)) {
      res.status(404).type("html").send(renderSpa(req.path));
      return;
    }
    res.status(404).type("text/plain").send("Not Found");
  });

  return app;
}
