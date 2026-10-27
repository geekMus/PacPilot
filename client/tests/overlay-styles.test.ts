/// <reference types="node" />
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readSource(path: string): string {
  return readFileSync(resolve(process.cwd(), "client", "src", path), "utf8");
}

describe("portaled overlay style architecture", () => {
  it("loads the shared overlay stylesheet from the application entry point", () => {
    const entry = readSource("main.ts");
    expect(entry).toContain('import "@/styles/overlays.css";');
  });

  it("keeps timezone Portal selectors out of the scoped admin view stylesheet", () => {
    const adminStyles = readSource("views/AdminView.css");
    const overlayStyles = readSource("styles/overlays.css");

    for (const selector of [
      ".timezone-options-menu",
      ".timezone-options-scroll-area",
      ".timezone-options-viewport",
      ".timezone-option",
      ".timezone-no-results",
    ]) {
      expect(overlayStyles, `missing global overlay selector ${selector}`).toContain(selector);
      expect(adminStyles, `Portal selector ${selector} leaked into scoped page CSS`).not.toContain(
        selector
      );
    }
  });

  it("keeps component-owned Portal styles unscoped", () => {
    for (const path of [
      "components/AppDialog.vue",
      "components/AppSelect.vue",
      "components/ConfirmPopover.vue",
      "components/UserPreferencesMenu.vue",
    ]) {
      const source = readSource(path);
      expect(source, `${path} must define its Portal styles in a non-scoped style block`).toMatch(
        /<style(?![^>]*\bscoped\b)[^>]*>/
      );
    }
  });
});
