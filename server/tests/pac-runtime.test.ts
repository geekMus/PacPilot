import { beforeEach, describe, expect, it } from "vitest";
import {
  computeEtag,
  computeSourceVersion,
  getRenderedPac,
  invalidateRenderedPac,
  isRenderFresh,
  renderPacSource,
  setRenderedPac,
  type PacRuleSource,
} from "../services/pac-runtime";
import { DEFAULT_SETTINGS } from "../domain/settings";
import type { AppSettings } from "../../shared/contracts";

function settings(patch: Partial<AppSettings> = {}): AppSettings {
  return { ...DEFAULT_SETTINGS, ...patch };
}

const snapshot: PacRuleSource = {
  fetchedAt: "2026-10-24T00:00:00.000Z",
  url: "https://example.com/list.txt",
  format: "plain-domains",
  proxyHosts: ["blocked.example"],
  directHosts: ["direct.example"],
};

const customBuilder = () => "function FindProxyForURL(){return 'DIRECT';}";

describe("computeEtag", () => {
  it("is stable for the same body and changes with content", () => {
    const a = computeEtag("body-a");
    expect(computeEtag("body-a")).toBe(a);
    expect(computeEtag("body-b")).not.toBe(a);
    expect(a.startsWith('"') && a.endsWith('"')).toBe(true);
  });
});

describe("computeSourceVersion", () => {
  it("changes when any render input changes", () => {
    const base = computeSourceVersion(settings(), null);
    expect(computeSourceVersion(settings(), null)).toBe(base);
    expect(computeSourceVersion(settings({ pacProxy: "PROXY 1.2.3.4:8080" }), null)).not.toBe(base);
    // DEFAULT_SETTINGS already compresses, so flip it the other way.
    expect(computeSourceVersion(settings({ pacCompress: false }), null)).not.toBe(base);
    expect(computeSourceVersion(settings({ blockList: ["a.example"] }), null)).not.toBe(base);
    expect(computeSourceVersion(settings({ mode: "remote" }), null)).not.toBe(base);
  });

  it("changes when the rule snapshot changes", () => {
    const base = computeSourceVersion(settings({ mode: "remote" }), snapshot);
    const newer = { ...snapshot, fetchedAt: "2026-10-25T00:00:00.000Z" };
    expect(computeSourceVersion(settings({ mode: "remote" }), newer)).not.toBe(base);
  });
});

describe("renderPacSource", () => {
  it("builds custom rules without a snapshot", () => {
    const out = renderPacSource(settings(), null, customBuilder);
    expect(out).toContain("FindProxyForURL");
  });

  it("requires a snapshot in remote mode", () => {
    expect(() => renderPacSource(settings({ mode: "remote" }), null, customBuilder)).toThrow(
      /远程规则尚未拉取/
    );
  });

  it("embeds remote hosts in remote mode", () => {
    const out = renderPacSource(settings({ mode: "remote" }), snapshot, customBuilder);
    expect(out).toContain("blocked.example");
    expect(out).toContain("direct.example");
  });
});

describe("render freshness", () => {
  beforeEach(() => invalidateRenderedPac());

  it("reports stale until a render matching the inputs is stored", () => {
    const s = settings();
    expect(isRenderFresh(s, null)).toBe(false);
    setRenderedPac({
      body: "x",
      source: "x",
      etag: computeEtag("x"),
      builtAt: new Date().toISOString(),
      sourceVersion: computeSourceVersion(s, null),
      stale: false,
      compressed: true,
    });
    expect(isRenderFresh(s, null)).toBe(true);
    // Changing any input invalidates it.
    expect(isRenderFresh(settings({ pacProxy: "PROXY 9.9.9.9:80" }), null)).toBe(false);
    expect(getRenderedPac()?.body).toBe("x");
  });
});
