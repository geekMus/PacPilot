import { describe, expect, it } from "vitest";

declare const Bun: {
  file(path: URL): { text(): Promise<string> };
};

function readSource(path: string): Promise<string> {
  return Bun.file(new URL(path, new URL("../src/", import.meta.url))).text();
}

describe("portaled overlay style architecture", () => {
  it("loads the shared overlay stylesheet from the application entry point", async () => {
    const entry = await readSource("main.ts");
    expect(entry).toContain('import "@/styles/overlays.css";');
  });

  it("keeps timezone Portal selectors out of the scoped admin view stylesheet", async () => {
    const adminStyles = await readSource("views/AdminView.css");
    const overlayStyles = await readSource("styles/overlays.css");

    for (const selector of [
      ".timezone-options-menu",
      ".timezone-options-scroll",
      ".timezone-options-viewport",
      ".timezone-option",
      ".timezone-no-results",
      ".timezone-sheet-title",
      ".timezone-sheet-body",
      ".timezone-sheet-search",
      ".timezone-sheet-options",
      ".timezone-sheet-options-viewport",
      ".timezone-custom-option",
      ".timezone-sheet-hint",
    ]) {
      expect(overlayStyles, `missing global overlay selector ${selector}`).toContain(selector);
      expect(adminStyles, `Portal selector ${selector} leaked into scoped page CSS`).not.toContain(selector);
    }
  });

  it("keeps component-owned Portal styles unscoped", async () => {
    for (const path of [
      "components/AppDialog.vue",
      "components/AppSelect.vue",
      "components/ConfirmPopover.vue",
      "components/UserPreferencesMenu.vue",
    ]) {
      const source = await readSource(path);
      expect(source, `${path} must define its Portal styles in a non-scoped style block`).toMatch(
        /<style(?![^>]*\\bscoped\\b)[^>]*>/
      );
    }
  });
});
