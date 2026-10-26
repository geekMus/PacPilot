/// <reference types="node" />
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readConfig(): string {
  return readFileSync(resolve(process.cwd(), "client", "vite.config.ts"), "utf8");
}

/**
 * 开发代理必须保留原始 Host 头。Vite 对字符串写法的代理会自动补 `changeOrigin: true`，
 * 把 Host 改写成后端地址；后端据此算出的 requestOrigin 与浏览器的 Origin 不再同源，
 * 所有 /api/admin/* 写操作都会 403 untrusted_origin。5173 被占用时 Vite 会递增到
 * 5174/5175，这个问题就必然出现。
 */
describe("vite dev proxy origin fidelity", () => {
  it("keeps the original Host header for every proxied prefix", () => {
    const config = readConfig();
    const proxyEntries = [...config.matchAll(/"(?<prefix>[^"]+)":\s*\{(?<body>[^}]*)\}/g)]
      .map((match) => ({ prefix: match.groups?.prefix ?? "", body: match.groups?.body ?? "" }))
      .filter((entry) => entry.prefix.startsWith("/"));

    expect(proxyEntries.map((entry) => entry.prefix)).toEqual(["/api", "/pac"]);
    for (const entry of proxyEntries) {
      expect(entry.body, `proxy ${entry.prefix} must set changeOrigin`).toContain(
        "changeOrigin: false"
      );
      expect(entry.body, `proxy ${entry.prefix} must keep a target`).toContain("target:");
    }
  });

  it("does not rely on the string shorthand that implies changeOrigin true", () => {
    const config = readConfig();
    // 字符串写法形如 `"/api": apiTarget,`，会被 Vite 展开成 changeOrigin: true。
    expect(config).not.toMatch(/"\/(?:api|pac)":\s*[A-Za-z_$][\w$]*\s*,/);
  });
});
