import fs from "fs";
import path from "path";

/**
 * 把当前路由要用的 JS/CSS 以 <link> 预加载提示注入 SPA 的 index.html。
 *
 * 没有这些提示时，浏览器必须先下载并执行入口脚本，才能知道当前页面还要哪个
 * 视图块，首屏因此白白多等一次往返。构建配置已开启 `build.manifest`，这里按
 * Vite manifest 解析出「视图块 + 它的静态依赖 + 关联样式」的完整集合。
 */
type ManifestChunk = {
  file: string;
  css?: string[];
  assets?: string[];
  imports?: string[];
};

type ViteManifest = Record<string, ManifestChunk>;

/** 路由路径 → 视图源文件（相对 client 根目录）。只影响预加载，缺失只损失优化不影响正确性。 */
const ROUTE_SOURCES: ReadonlyArray<readonly [RegExp, string]> = [
  [/^\/$/, "src/views/StatusView.vue"],
  [/^\/admin$/, "src/views/AdminDashboardView.vue"],
  [/^\/admin\/dashboard$/, "src/views/AdminDashboardView.vue"],
  [/^\/admin\/login$/, "src/views/LoginView.vue"],
  [/^\/admin\/settings$/, "src/views/AdminView.vue"],
  [/^\/admin\/system-settings$/, "src/views/SystemSettingsView.vue"],
  [/^\/admin\/workflows$/, "src/views/WorkflowView.vue"],
  [/^\/admin\/workflows\/[^/]+$/, "src/views/WorkflowDetailView.vue"],
  [/^\/admin\/monitor$/, "src/views/MonitoringView.vue"],
  [/^\/admin\/logs$/, "src/views/LogsView.vue"],
  [/^\/admin\/notifications$/, "src/views/NotificationsView.vue"],
];

/** 入口脚本与 stylesheet 由 index.html 自身声明，重复注入只会产生重复请求。 */
const HEAD_MARKER = "</head>";

/**
 * 首屏必然会发起的两个探测请求：运行时配置与会话状态。它们都只有几十字节，却必须
 * 等入口脚本下载并执行完才会发出；在慢网下这等于白白多等两次串行往返。把它们提前
 * 到 HTML 解析阶段，等入口脚本执行完可以直接复用结果。
 *
 * `crossorigin` 必须与客户端 `fetch` 的 credentials 模式一致，否则浏览器不会复用
 * 预加载结果，反而多出一次真实请求：`config.json` 用 `credentials: "omit"`，会话
 * 接口走 cookie，用 `"include"`。
 */
const EARLY_FETCH_PRELOADS = [
  `<link rel="preload" as="fetch" crossorigin="anonymous" href="/config.json">`,
  `<link rel="preload" as="fetch" crossorigin="use-credentials" href="/api/admin/session">`,
].join("");

export interface SpaPreloads {
  /** 给定请求路径，返回要注入到 </head> 前的标签串。 */
  forPath(requestPath: string): string;
}

function readManifest(clientDir: string): ViteManifest | null {
  const file = path.join(clientDir, ".vite", "manifest.json");
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as ViteManifest;
  } catch {
    // 未构建或构建未生成 manifest：退化成不注入，页面照常工作。
    return null;
  }
}

function collectChunks(manifest: ViteManifest, key: string): ManifestChunk[] {
  const seen = new Set<string>();
  const collected: ManifestChunk[] = [];
  const visit = (currentKey: string): void => {
    if (seen.has(currentKey)) return;
    seen.add(currentKey);
    const chunk = manifest[currentKey];
    if (!chunk) return;
    collected.push(chunk);
    for (const imported of chunk.imports ?? []) visit(imported);
  };
  visit(key);
  return collected;
}

const ENTRY_KEY = "index.html";

/**
 * 把视图源文件解析成 manifest 键。
 *
 * 视图模块被多个 chunk 共享时（例如路由动态导入与某个子组件同时引用它），Rollup 会
 * 把它提升成共享块，manifest 只在共享块的键下登记产物文件名，源文件路径反而查不到。
 * 这时按文件名前缀回退匹配，避免该路由静默失去全部预加载提示。
 */
function resolveEntryKey(manifest: ViteManifest, source: string): string | null {
  if (manifest[source]) return source;
  const base = path.basename(source, path.extname(source));
  let fallback: string | null = null;
  for (const [key, chunk] of Object.entries(manifest)) {
    if (!chunk.file) continue;
    if (!path.basename(chunk.file).startsWith(`${base}-`)) continue;
    // 同名条目的 CSS 也会命中，真正的脚本块优先。
    if (chunk.file.endsWith(".js")) return key;
    fallback ??= key;
  }
  return fallback;
}

/** 收集视图块及其静态依赖涉及的所有产物文件（JS 与 CSS）。 */
function collectFiles(manifest: ViteManifest, key: string): string[] {
  const files: string[] = [];
  for (const chunk of collectChunks(manifest, key)) {
    for (const asset of chunk.assets ?? []) files.push(asset);
    if (chunk.file.endsWith(".js")) files.push(chunk.file);
    // 静态 import 的 chunk 会把 CSS 记在自身条目上，需要一并取到。
    for (const css of chunk.css ?? []) files.push(css);
  }
  return files;
}

function toTag(file: string): string {
  // 先排样式：CSS 才能参与首帧渲染，放在脚本提示之后会晚一个来回。
  return file.endsWith(".css")
    ? `<link rel="stylesheet" crossorigin href="/${file}">`
    : `<link rel="modulepreload" crossorigin href="/${file}">`;
}

export function createSpaPreloads(clientDir: string): SpaPreloads {
  const manifest = readManifest(clientDir);
  // 入口自身的 chunk 与样式已由 index.html 声明，重复提示只是噪声。
  const declared = new Set<string>();
  const entry = manifest?.[ENTRY_KEY];
  if (entry) {
    declared.add(entry.file);
    for (const css of entry.css ?? []) declared.add(css);
  }
  const cache = new Map<string, string>();

  return {
    forPath(requestPath: string): string {
      // 早期请求预加载不依赖构建 manifest：即使还没构建也要尽早发出探测请求。
      if (!manifest) return EARLY_FETCH_PRELOADS;
      const hit = cache.get(requestPath);
      if (hit !== undefined) return hit;

      const source = ROUTE_SOURCES.find(([pattern]) => pattern.test(requestPath))?.[1];
      const key = source ? resolveEntryKey(manifest, source) : null;
      const files = key ? collectFiles(manifest, key) : [];
      const unique = [...new Set(files)].filter((file) => !declared.has(file));
      const ordered = [
        ...unique.filter((file) => file.endsWith(".css")),
        ...unique.filter((file) => !file.endsWith(".css")),
      ];
      const tags = EARLY_FETCH_PRELOADS + ordered.map(toTag).join("");
      cache.set(requestPath, tags);
      return tags;
    },
  };
}

/** 在 </head> 前插入预加载标签；没有 </head> 时原样返回。 */
export function injectPreloadTags(html: string, tags: string): string {
  if (!tags) return html;
  const index = html.indexOf(HEAD_MARKER);
  if (index < 0) return html;
  return html.slice(0, index) + tags + html.slice(index);
}

/**
 * 把运行时配置内联进 HTML，让客户端同步拿到后端地址。
 *
 * `config.json` 是首屏第一个串行往返：入口脚本执行后才发出，而会话探测和首个 API
 * 请求都必须等它解析完（见 client/src/api/runtime-config.ts）。配置只是构建期写入
 * 的常量，内联后这一跳消失，会话请求可以在脚本执行完立即发出。
 *
 * 文件缺失或内容异常时返回空串，客户端仍会回退到 fetch，静态托管场景不受影响。
 */
export function readInlineRuntimeConfig(clientDir: string): string {
  try {
    const raw = fs.readFileSync(path.join(clientDir, "config.json"), "utf8");
    const parsed = JSON.parse(raw) as { apiBaseUrl?: unknown };
    const apiBaseUrl = typeof parsed.apiBaseUrl === "string" ? parsed.apiBaseUrl : "";
    // `<` 必须转义：JSON 内容落在 <script> 里，出现 "</script>" 会提前结束脚本。
    const payload = JSON.stringify({ apiBaseUrl }).replace(/</g, "\\u003c");
    return `<script>window.__PAC_CONFIG__=${payload}</script>`;
  } catch {
    return "";
  }
}
