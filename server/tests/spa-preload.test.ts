import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createSpaPreloads, injectPreloadTags, readInlineRuntimeConfig } from "@server/utils/spa-preload";

/** 构造一个临时 client 目录，并按需写入 Vite manifest。 */
function makeClientDir(manifest?: unknown): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pacpilot-preload-"));
  if (manifest !== undefined) {
    fs.mkdirSync(path.join(dir, ".vite"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".vite", "manifest.json"), JSON.stringify(manifest), "utf8");
  }
  return dir;
}

const tempDirs: string[] = [];

function makeDir(manifest?: unknown): string {
  const dir = makeClientDir(manifest);
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
});

const manifest = {
  "index.html": { file: "assets/index-AAA.js", css: ["assets/index-AAA.css"] },
  "src/views/LogsView.vue": {
    file: "assets/LogsView-BBB.js",
    css: ["assets/LogsView-BBB.css"],
    assets: ["assets/logo-CCC.svg"],
    imports: ["_AppSelect-DDD.js", "index.html"],
  },
  "_AppSelect-DDD.js": {
    file: "assets/AppSelect-DDD.js",
    css: ["assets/AppSelect-DDD.css"],
    imports: ["_AppSelect-DDD.js"],
  },
  // 只按文件名前缀能命中的共享块（源文件路径已不在 manifest 里）。
  "_NotificationsView-EEE.js": { file: "assets/NotificationsView-EEE.js" },
  // 同名条目的 CSS：只有在没有脚本块时才允许回退到这里。
  "_WorkflowView-GGG.css": { file: "assets/WorkflowView-GGG.css" },
};

describe("createSpaPreloads", () => {
  it("未构建时只注入早期请求预加载", () => {
    const preloads = createSpaPreloads(makeDir());
    const tags = preloads.forPath("/admin/logs");

    expect(tags).toContain('<link rel="preload" as="fetch" crossorigin="anonymous" href="/config.json">');
    expect(tags).toContain('crossorigin="use-credentials" href="/api/admin/session"');
    expect(tags).not.toContain("modulepreload");
    expect(tags).not.toContain("stylesheet");
  });

  it("manifest 损坏时退化成只注入早期请求预加载", () => {
    const dir = makeDir();
    fs.mkdirSync(path.join(dir, ".vite"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".vite", "manifest.json"), "{ not json", "utf8");

    expect(createSpaPreloads(dir).forPath("/admin/logs")).not.toContain("modulepreload");
  });

  it("注入视图块、静态依赖与样式的预加载标签，并跳过入口已声明的产物", () => {
    const tags = createSpaPreloads(makeDir(manifest)).forPath("/admin/logs");

    // 视图块自身与它的静态依赖。
    expect(tags).toContain('<link rel="modulepreload" crossorigin href="/assets/LogsView-BBB.js">');
    expect(tags).toContain('<link rel="modulepreload" crossorigin href="/assets/AppSelect-DDD.js">');
    // 关联样式与静态资源。
    expect(tags).toContain('<link rel="stylesheet" crossorigin href="/assets/LogsView-BBB.css">');
    expect(tags).toContain('<link rel="modulepreload" crossorigin href="/assets/logo-CCC.svg">');
    // import 链上的样式同样被收集。
    expect(tags).toContain('<link rel="stylesheet" crossorigin href="/assets/AppSelect-DDD.css">');
    // 入口脚本与入口样式由 index.html 自己声明，不能重复提示。
    expect(tags).not.toContain("/assets/index-AAA.js");
    expect(tags).not.toContain("/assets/index-AAA.css");
  });

  it("样式排在脚本之前，且不重复声明同一文件", () => {
    const tags = createSpaPreloads(makeDir(manifest)).forPath("/admin/logs");

    const cssIndex = tags.indexOf('<link rel="stylesheet" crossorigin href="/assets/LogsView-BBB.css">');
    const jsIndex = tags.indexOf('<link rel="modulepreload" crossorigin href="/assets/LogsView-BBB.js">');
    expect(cssIndex).toBeGreaterThanOrEqual(0);
    expect(jsIndex).toBeGreaterThan(cssIndex);
    expect(tags.split("/assets/LogsView-BBB.js").length - 1).toBe(1);
    // 循环 import 不应导致无限递归或重复标签。
    expect(tags.split("/assets/AppSelect-DDD.js").length - 1).toBe(1);
  });

  it("源文件键缺失时按文件名前缀回退到共享块", () => {
    const tags = createSpaPreloads(makeDir(manifest)).forPath("/admin/notifications");

    expect(tags).toContain('<link rel="modulepreload" crossorigin href="/assets/NotificationsView-EEE.js">');
  });

  it("只有 CSS 条目时才回退到 CSS 块，且不把它当成脚本", () => {
    const tags = createSpaPreloads(makeDir(manifest)).forPath("/admin/workflows");

    expect(tags).not.toContain("WorkflowView-GGG.js");
    expect(tags.split("modulepreload").length - 1).toBe(0);
  });

  it("同一路径重复查询命中缓存且结果一致", () => {
    const preloads = createSpaPreloads(makeDir(manifest));

    expect(preloads.forPath("/admin/logs")).toBe(preloads.forPath("/admin/logs"));
  });

  it("未登记的路由不注入任何构建产物提示", () => {
    const tags = createSpaPreloads(makeDir(manifest)).forPath("/some/unknown/path");

    expect(tags).toContain("/config.json");
    expect(tags).not.toContain("modulepreload");
  });

  it("路由已登记但 manifest 里查不到对应块时同样不注入", () => {
    const tags = createSpaPreloads(makeDir(manifest)).forPath("/admin/login");

    expect(tags).not.toContain("modulepreload");
  });

  it("工作流详情页按动态段匹配视图", () => {
    const tags = createSpaPreloads(
      makeDir({ "_WorkflowDetailView-HHH.js": { file: "assets/WorkflowDetailView-HHH.js" } })
    ).forPath("/admin/workflows/abc-123");

    expect(tags).toContain('<link rel="modulepreload" crossorigin href="/assets/WorkflowDetailView-HHH.js">');
  });
});

describe("injectPreloadTags", () => {
  const html = "<html><head><title>t</title></head><body></body></html>";

  it("把标签插到 </head> 之前", () => {
    const result = injectPreloadTags(html, "<link rel=\"preload\">");

    expect(result).toBe('<html><head><title>t</title><link rel="preload"></head><body></body></html>');
  });

  it("没有标签时原样返回", () => {
    expect(injectPreloadTags(html, "")).toBe(html);
  });

  it("没有 </head> 时原样返回", () => {
    const bare = "<html><body>no head</body></html>";

    expect(injectPreloadTags(bare, "<link rel=\"preload\">")).toBe(bare);
  });
});

describe("readInlineRuntimeConfig", () => {
  it("把 config.json 内联成可同步读取的脚本", () => {
    const dir = makeDir();
    fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({ apiBaseUrl: "https://api.example.com" }), "utf8");

    expect(readInlineRuntimeConfig(dir)).toBe(
      '<script>window.__PAC_CONFIG__={"apiBaseUrl":"https://api.example.com"}</script>'
    );
  });

  it("没有 config.json 时返回空串（客户端回退到 fetch）", () => {
    expect(readInlineRuntimeConfig(makeDir())).toBe("");
  });

  it("内容损坏或字段类型不对时返回空串", () => {
    const broken = makeDir();
    fs.writeFileSync(path.join(broken, "config.json"), "{ not json", "utf8");
    expect(readInlineRuntimeConfig(broken)).toBe("");

    const wrongType = makeDir();
    fs.writeFileSync(path.join(wrongType, "config.json"), JSON.stringify({ apiBaseUrl: 42 }), "utf8");
    expect(readInlineRuntimeConfig(wrongType)).toBe('<script>window.__PAC_CONFIG__={"apiBaseUrl":""}</script>');
  });

  it("转义 `<` 以免内容提前结束 script 标签", () => {
    const dir = makeDir();
    fs.writeFileSync(
      path.join(dir, "config.json"),
      JSON.stringify({ apiBaseUrl: "https://evil.example/</script><script>alert(1)</script>" }),
      "utf8"
    );

    const html = readInlineRuntimeConfig(dir);

    expect(html).not.toContain("</script><script>alert");
    expect(html).toContain("\\u003c");
  });
});
