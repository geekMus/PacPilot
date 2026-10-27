/**
 * Lighthouse page analyzer for PacPilot.
 *
 * Starts from a running server (BASE_URL), signs in as the administrator to
 * obtain the session cookie, then runs Lighthouse against every page with the
 * session injected via extra headers so authenticated admin routes render.
 * Emits per-page JSON/HTML reports plus a Markdown summary. Pages that score
 * below MIN_SCORE (Performance) are recorded in the summary but do NOT fail the
 * run; only genuine script errors (login failure, unexpected redirect, report
 * generation failure) exit non-zero. Every page is also checked for an
 * unexpected redirect, so a session that silently stops working fails the run
 * instead of reporting scores for the login page.
 *
 * Usage (Node >= 18):
 *   BASE_URL=http://127.0.0.1:18010 ADMIN_PASSWORD=… node scripts/lighthouse/analyze.mjs
 * Env:
 *   BASE_URL       target origin (required)
 *   ADMIN_PASSWORD admin password for the session cookie (required)
 *   OUTPUT_DIR     report directory, default `lighthouse-reports`
 *   MIN_SCORE      performance reporting threshold, default 70; pages below it
 *                  are listed in the summary but do not fail the run
 *   PRESET         `mobile`, `desktop`, or `both` (default `both`)
 *   ONLY           comma separated page keys to analyze (iteration helper)
 *   SEED_RULES     `1` writes a deterministic rule set before measuring, so the
 *                  pages render with rules instead of the empty-instance layout
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const chromeLauncher = require("chrome-launcher");
const lighthouse = require("lighthouse");

const SESSION_COOKIE = "pacpilot_admin_session";

/** Pages under test. Notes:
 * - The workflow detail route needs a run id, so the list-based workflows page
 *   stands in for it (identical bundle and data flow shape).
 * - The client-side 404 view is only reachable at unknown paths **below /admin/**:
 *   the server answers those with the SPA shell and HTTP 200, while any other
 *   unknown path gets a real HTTP 404 that Lighthouse scores as a page-load
 *   error. The probe path therefore has to stay under /admin/. */
const PAGES = [
  { key: "status", name: "公共状态页", path: "/" },
  { key: "login", name: "登录页", path: "/admin/login" },
  { key: "dashboard", name: "总览", path: "/admin/dashboard" },
  { key: "settings", name: "生成配置", path: "/admin/settings" },
  { key: "system", name: "系统设置", path: "/admin/system-settings" },
  { key: "workflows", name: "工作流", path: "/admin/workflows" },
  { key: "monitor", name: "网络监控", path: "/admin/monitor" },
  { key: "logs", name: "运行日志", path: "/admin/logs" },
  { key: "notifications", name: "通知渠道", path: "/admin/notifications" },
  { key: "not-found", name: "404 页面", path: "/admin/lighthouse-404-probe" },
];

const baseUrl = process.env.BASE_URL;
const adminPassword = process.env.ADMIN_PASSWORD;
if (!baseUrl || !adminPassword) {
  console.error("BASE_URL and ADMIN_PASSWORD are required.");
  process.exit(2);
}
const outputDir = path.resolve(process.env.OUTPUT_DIR || "lighthouse-reports");
const minScore = Number(process.env.MIN_SCORE || 70);
const preset = ["mobile", "desktop", "both"].includes(process.env.PRESET)
  ? process.env.PRESET
  : "both";
const only = process.env.ONLY ? new Set(process.env.ONLY.split(",").map((s) => s.trim())) : null;
const pages = only ? PAGES.filter((page) => only.has(page.key)) : PAGES;
const seedRules = process.env.SEED_RULES === "1";

/** Deterministic rule set used by SEED_RULES.
 *
 * A freshly initialized instance has an empty rule set, so the status page
 * renders neither the counters nor the rule lists and every page looks faster
 * than it does in real use. Seeding a fixed, modest rule set keeps the numbers
 * comparable across runs while exercising the same rendering paths. */
const SEED_DIRECT_COUNT = 40;
const SEED_BLOCK_COUNT = 20;

function seedSettingsPayload() {
  const rules = (prefix, count) =>
    Array.from({ length: count }, (_, index) => {
      const suffix = String(index + 1).padStart(2, "0");
      return `${prefix}-${suffix}.example.com`;
    });
  return {
    mode: "custom",
    pacProxy: "SOCKS5 127.0.0.1:1080; DIRECT",
    pacCompress: true,
    listUrl: "",
    blockList: rules("block", SEED_BLOCK_COUNT),
    directList: rules("direct", SEED_DIRECT_COUNT),
    cronSchedule: "",
    timezone: "Asia/Shanghai",
    logRetentionDays: 30,
  };
}

async function seedServer(cookie) {
  const payload = seedSettingsPayload();
  const response = await fetch(`${baseUrl}/api/admin/settings`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Origin: baseUrl,
      Cookie: `${SESSION_COOKIE}=${cookie}`,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`seeding settings failed: HTTP ${response.status}`);
  // 状态页的规则列表直接来自这个接口：必须确认种子真的落库，否则后面量到的还是空实例。
  const status = await (await fetch(`${baseUrl}/api/status`)).json();
  const directCount = Array.isArray(status.directList) ? status.directList.length : -1;
  if (directCount !== payload.directList.length) {
    throw new Error(
      `seed verification failed: /api/status reports ${directCount} direct rules, ` +
        `expected ${payload.directList.length}`
    );
  }
  console.log(
    `Seeded ${payload.directList.length} direct + ${payload.blockList.length} block rules.`
  );
}

async function login() {
  const response = await fetch(`${baseUrl}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: baseUrl },
    body: JSON.stringify({ password: adminPassword }),
  });
  if (!response.ok) throw new Error(`admin login failed: HTTP ${response.status}`);
  const setCookie = response.headers.get("set-cookie") ?? "";
  const match = setCookie.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  if (!match) throw new Error("admin login response carried no session cookie");
  return match[1];
}

function scoreOf(result, category) {
  const entry = Object.values(result.categories).find((item) => item.id === category);
  if (!entry) return null;
  return Math.round(entry.score * 100);
}

function metricOf(audits, id) {
  const audit = audits[id];
  if (!audit || audit.numericValue === undefined || audit.numericValue === null) return null;
  return audit.numericValue;
}

function topOpportunities(audits) {
  return Object.values(audits)
    .filter((audit) => audit.details?.type === "opportunity" && audit.numericValue > 50)
    .sort((a, b) => b.numericValue - a.numericValue)
    .slice(0, 5)
    .map((audit) => ({
      title: audit.title,
      savingsMs: Math.round(audit.numericValue),
    }));
}

function scoreBadge(score) {
  if (score === null) return "—";
  if (score >= 90) return `🟢 ${score}`;
  if (score >= 70) return `🟡 ${score}`;
  return `🔴 ${score}`;
}

function formatMs(value) {
  if (value === null) return "—";
  return `${(value / 1000).toFixed(2)} s`;
}

/** 桌面端预设中对评分有影响的部分：设备形态、屏幕模拟与节流参数。
 * 应用不按 User-Agent 分支渲染，因此这里不覆盖 `emulatedUserAgent`。 */
const DESKTOP_FLAGS = {
  formFactor: "desktop",
  screenEmulation: { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1 },
  throttling: {
    rttMs: 40,
    throughputKbps: 10240,
    uploadThroughputKbps: 8000,
    cpuSlowdownMultiplier: 1,
  },
};

async function runOnce(chrome, page, cookie, mode) {
  const url = `${baseUrl}${page.path}`;
  // 登录页以未登录视角测量：注入会话时路由守卫会直接跳转后台，
  // 采到的将是总览页而非登录页本身。
  const extraHeaders = page.key === "login" ? {} : { Cookie: `${SESSION_COOKIE}=${cookie}` };
  const runnerResult = await lighthouse.default(url, {
    port: chrome.port,
    extraHeaders,
    onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
    output: ["json", "html"],
    quiet: true,
    logLevel: "error",
    ...(mode === "desktop" ? DESKTOP_FLAGS : {}),
  });
  if (!runnerResult) throw new Error(`lighthouse returned no result for ${url}`);
  const { report: reports, lhr } = runnerResult;
  // 会话失效时后台路由会被前端守卫改写到 /admin/login?redirect=…：这类前端跳转
  // 不会改变 finalUrl（它只反映文档层重定向），只能靠 finalDisplayedUrl 发现，
  // 否则分数看起来"正常"，量的却是登录页。
  const displayedUrl = lhr.finalDisplayedUrl || lhr.finalUrl || url;
  const finalPath = new URL(displayedUrl).pathname;
  if (finalPath !== page.path) {
    throw new Error(
      `${url} 最终停留在 ${displayedUrl}：会话未生效或路由守卫发生了重定向，` +
        "此时量到的不是目标页面。"
    );
  }
  const json = Array.isArray(reports) ? reports[0] : reports;
  const html = Array.isArray(reports) ? reports[1] : "";
  const suffix = mode === "desktop" ? ".desktop" : "";
  await writeFile(path.join(outputDir, `${page.key}${suffix}.report.json`), json);
  await writeFile(path.join(outputDir, `${page.key}${suffix}.report.html`), html);
  return {
    page,
    url,
    mode,
    scores: {
      performance: scoreOf(lhr, "performance"),
      accessibility: scoreOf(lhr, "accessibility"),
      "best-practices": scoreOf(lhr, "best-practices"),
      seo: scoreOf(lhr, "seo"),
    },
    metrics: {
      FCP: metricOf(lhr.audits, "first-contentful-paint"),
      LCP: metricOf(lhr.audits, "largest-contentful-paint"),
      TBT: metricOf(lhr.audits, "total-blocking-time"),
      CLS: metricOf(lhr.audits, "cumulative-layout-shift"),
      "Speed Index": metricOf(lhr.audits, "speed-index"),
    },
    opportunities: topOpportunities(lhr.audits),
  };
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  const cookie = await login();
  if (seedRules) await seedServer(cookie);

  const chrome = await chromeLauncher.launch({
    chromeFlags: ["--headless", "--disable-gpu", "--no-sandbox", "--disable-dev-shm-usage"],
  });
  const modes =
    preset === "desktop" ? ["desktop"] : preset === "mobile" ? ["mobile"] : ["mobile", "desktop"];
  const results = [];
  try {
    for (const page of pages) {
      for (const mode of modes) {
        process.stdout.write(`Analyzing ${page.key} (${page.path}, ${mode}) … `);
        const entry = await runOnce(chrome, page, cookie, mode);
        results.push(entry);
        console.log(`performance=${entry.scores.performance}`);
      }
    }
  } finally {
    await chrome.kill();
  }

  const failing = results.filter((entry) => (entry.scores.performance ?? 0) < minScore);
  const markdown = renderReport(results, failing);
  await writeFile(path.join(outputDir, "summary.md"), markdown);
  console.log(`\nReport written to ${outputDir}/summary.md\n`);
  console.log(markdown);

  // 低于阈值只作为报告结论呈现，不使运行失败；脚本自身错误（登录失败、
  // 页面被重定向、会话失效、报告生成失败）才会经 main().catch 非零退出。
  if (failing.length) {
    console.warn(
      `\n${failing.length} page(s) scored below ${minScore} on Performance (recorded in report): ` +
        failing.map((entry) => `${entry.page.name} (${entry.scores.performance})`).join(", ")
    );
  }
}

function renderReport(results, failing) {
  const modes = [...new Set(results.map((entry) => entry.mode))];
  const modeTitle = { mobile: "移动端（模拟 4G 节流 + 4× CPU 减速）", desktop: "桌面端" };
  const lines = [];
  lines.push(`# 🚦 PacPilot 页面 Lighthouse 报告`);
  lines.push("");
  lines.push(`- **目标**：\`${baseUrl}\`　**阈值**：性能 < ${minScore} 分记为未达标（不判定失败）`);
  lines.push(
    `- **范围**：${new Set(results.map((e) => e.page.key)).size} 个页面（工作流详情页与列表页共用同一代码包，由「工作流」页代表；404 页面通过 /admin/ 下的未知路径访问）`
  );
  if (seedRules) {
    lines.push(
      `- **测试数据**：已写入固定规则集（${SEED_DIRECT_COUNT} 条直连 + ${SEED_BLOCK_COUNT} 条拦截），避免量到空实例的偏快结果`
    );
  }
  lines.push("");
  for (const mode of modes) {
    lines.push(`## ${mode === "mobile" ? "📱 移动端预设" : "🖥️ 桌面端预设"} — ${modeTitle[mode]}`);
    lines.push("");
    lines.push(`| 页面 | 性能 | 无障碍 | 最佳实践 | SEO |`);
    lines.push(`| --- | :---: | :---: | :---: | :---: |`);
    for (const entry of results.filter((e) => e.mode === mode)) {
      lines.push(
        `| ${entry.page.name} \`${entry.page.path}\` | ${scoreBadge(entry.scores.performance)} | ${scoreBadge(
          entry.scores.accessibility
        )} | ${scoreBadge(entry.scores["best-practices"])} | ${scoreBadge(entry.scores.seo)} |`
      );
    }
    lines.push("");
  }
  if (failing.length) {
    lines.push(`## ⚠️ 低于 ${minScore} 分的页面`);
    lines.push("");
    for (const entry of failing) {
      lines.push(
        `- 🔴 **${entry.page.name}** \`${entry.page.path}\`（${entry.mode === "desktop" ? "桌面" : "移动"}端）性能仅 **${entry.scores.performance}** 分，见下方改进机会`
      );
    }
    lines.push("");
  }
  lines.push(`## 关键指标与改进机会`);
  lines.push("");
  for (const entry of results) {
    lines.push(
      `### ${entry.page.name} \`${entry.page.path}\`（${entry.mode === "desktop" ? "桌面" : "移动"}端）`
    );
    lines.push("");
    lines.push(
      `FCP ${formatMs(entry.metrics.FCP)} · LCP ${formatMs(entry.metrics.LCP)} · TBT ${formatMs(
        entry.metrics.TBT
      )} · CLS ${entry.metrics.CLS ?? "—"} · Speed Index ${formatMs(entry.metrics["Speed Index"])}`
    );
    if (entry.opportunities.length) {
      lines.push("");
      for (const opportunity of entry.opportunities) {
        lines.push(`- ⚠️ ${opportunity.title}（预计节省 ${opportunity.savingsMs} ms）`);
      }
    }
    lines.push("");
  }
  lines.push(
    `> 完整单页报告（含逐项审计与诊断）见本次运行的 ` +
      "`lighthouse-reports`" +
      ` 构建产物（HTML 版可直接在浏览器打开）。`
  );
  lines.push("");
  return lines.join("\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
