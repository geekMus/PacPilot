import { describe, expect, it } from "vitest";
import adminStyles from "../src/views/AdminView.css?raw";
import overlayStyles from "../src/styles/overlays.css?raw";
import appEntry from "../src/main.ts?raw";
import appDialog from "../src/components/AppDialog.vue?raw";
import appSelect from "../src/components/AppSelect.vue?raw";
import confirmPopover from "../src/components/ConfirmPopover.vue?raw";
import userPreferencesMenu from "../src/components/UserPreferencesMenu.vue?raw";

describe("portaled overlay style architecture", () => {
  it("loads the shared overlay stylesheet from the application entry point", () => {
    expect(appEntry).toContain('import "@/styles/overlays.css";');
  });

  it("keeps timezone Portal selectors out of the scoped admin view stylesheet", () => {
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

  it("keeps component-owned Portal styles unscoped", () => {
    for (const [path, source] of [
      ["AppDialog.vue", appDialog],
      ["AppSelect.vue", appSelect],
      ["ConfirmPopover.vue", confirmPopover],
      ["UserPreferencesMenu.vue", userPreferencesMenu],
    ]) {
      expect(source, `${path} must define its Portal styles in a non-scoped style block`).toMatch(
        /<style(?![^>]*\\bscoped\\b)[^>]*>/
      );
    }
  });
});
