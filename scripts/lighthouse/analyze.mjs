/**
 * Lighthouse page analyzer for PacPilot.
 *
 * Starts from a running server (BASE_URL), signs in as the administrator to
 * obtain the session cookie, then runs Lighthouse against every page with the
 * session injected via extra headers so authenticated admin routes render.
 * Emits per-page JSON/HTML reports plus a Markdown summary; exits non-zero
 * when any page scores below MIN_SCORE (Performance).
 *
 * Usage (Node >= 18):
 *   BASE_URL=http://127.0.0.1:18010 ADMIN_PASSWORD=… node scripts/lighthouse/analyze.mjs
 * Env:
 *   BASE_URL       target origin (required)
 *   ADMIN_PASSWORD admin password for the session cookie (required)
 *   OUTPUT_DIR     report directory, default `lighthouse-reports`
 *   MIN_SCORE      performance failure threshold, default 70
 *   PRESET         `mobile`, `desktop`, or `both` (default `both`)
 *   ONLY           comma separated page keys to analyze (iteration helper)
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
 * - Unknown paths are answered by the server with HTTP 404 (plus the SPA shell),
 *   which Lighthouse scores as a page-load error; the client-side 404 view is
 *   therefore not a measurable navigation target and is excluded. */
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

/** Lighthouse 桌面预设的等价 flag 组合（CLI 的 --preset=desktop 展开值）。 */
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

  if (failing.length) {
    console.error(
      `\n${failing.length} page(s) scored below ${minScore} on Performance: ` +
        failing.map((entry) => `${entry.page.name} (${entry.scores.performance})`).join(", ")
    );
    process.exit(1);
  }
}

function renderReport(results, failing) {
  const modes = [...new Set(results.map((entry) => entry.mode))];
  const modeTitle = { mobile: "移动端（模拟 4G 节流 + 4× CPU 减速）", desktop: "桌面端" };
  const lines = [];
  lines.push(`# 🚦 PacPilot 页面 Lighthouse 报告`);
  lines.push("");
  lines.push(`- **目标**：\`${baseUrl}\`　**阈值**：性能 < ${minScore} 分判定失败`);
  lines.push(
    `- **范围**：${new Set(results.map((e) => e.page.key)).size} 个页面（工作流详情页与列表页共用同一代码包，由「工作流」页代表；客户端 404 页由服务端以 HTTP 404 响应，不适用 Lighthouse 评分）`
  );
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
