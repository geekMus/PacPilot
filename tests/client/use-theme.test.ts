import { mount } from "@vue/test-utils";
import { defineComponent, h, nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const storedValues = new Map<string, string>();
const localStorageMock: Storage = {
  get length() {
    return storedValues.size;
  },
  clear() {
    storedValues.clear();
  },
  getItem(key) {
    return storedValues.get(key) ?? null;
  },
  key(index) {
    return [...storedValues.keys()][index] ?? null;
  },
  removeItem(key) {
    storedValues.delete(key);
  },
  setItem(key, value) {
    storedValues.set(String(key), String(value));
  },
};

function installMatchMedia(matches = false) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const media = {
    matches,
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    addEventListener: vi.fn((_: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener);
    }),
    removeEventListener: vi.fn((_: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener);
    }),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
  } as unknown as MediaQueryList;
  vi.stubGlobal("matchMedia", vi.fn(() => media));
  return { media, listeners };
}

describe("useTheme", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", localStorageMock);
    localStorageMock.clear();
    document.documentElement.className = "";
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("defaults to system mode and resolves the operating-system preference", async () => {
    installMatchMedia(true);
    const { initThemeEarly, useTheme } = await import("../../client/src/composables/useTheme");
    initThemeEarly();
    expect(document.documentElement.classList.contains("theme-dark")).toBe(true);

    const wrapper = mount(defineComponent({
      setup() {
        const theme = useTheme();
        return () => h("span", theme.resolved());
      },
    }));
    expect(wrapper.text()).toBe("dark");
    wrapper.unmount();
  });

  it("restores valid stored modes and falls back for invalid values", async () => {
    localStorage.setItem("pacpilot-theme", "light");
    installMatchMedia(true);
    const { initThemeEarly, useTheme } = await import("../../client/src/composables/useTheme");
    initThemeEarly();
    expect(document.documentElement.classList.contains("theme-light")).toBe(true);

    const wrapper = mount(defineComponent({
      setup() {
        const theme = useTheme();
        return () => h("span", theme.mode.value);
      },
    }));
    expect(wrapper.text()).toBe("light");
    wrapper.unmount();

    localStorage.setItem("pacpilot-theme", "not-a-mode");
    vi.resetModules();
    const second = await import("../../client/src/composables/useTheme");
    second.initThemeEarly();
    expect(document.documentElement.classList.contains("theme-dark")).toBe(true);
  });

  it("persists explicit mode changes and applies the corresponding class", async () => {
    installMatchMedia(false);
    const { useTheme } = await import("../../client/src/composables/useTheme");
    const wrapper = mount(defineComponent({
      setup() {
        const theme = useTheme();
        return () => h("button", {
          onClick: () => theme.setMode("dark"),
        }, theme.mode.value);
      },
    }));

    await wrapper.get("button").trigger("click");
    await nextTick();
    expect(localStorage.getItem("pacpilot-theme")).toBe("dark");
    expect(document.documentElement.classList.contains("theme-dark")).toBe(true);
    expect(document.documentElement.classList.contains("theme-light")).toBe(false);
    wrapper.unmount();
  });

  it("updates on system preference changes only in system mode and removes listeners", async () => {
    const { media, listeners } = installMatchMedia(false);
    const { useTheme } = await import("../../client/src/composables/useTheme");
    const wrapper = mount(defineComponent({
      setup() {
        const theme = useTheme();
        return () => h("span", theme.resolved());
      },
    }));
    expect(wrapper.text()).toBe("light");
    expect(listeners.size).toBe(1);

    Object.defineProperty(media, "matches", { configurable: true, value: true });
    for (const listener of listeners) listener({ matches: true } as MediaQueryListEvent);
    await nextTick();
    expect(document.documentElement.classList.contains("theme-dark")).toBe(true);

    wrapper.unmount();
    expect(listeners.size).toBe(0);
    expect(media.removeEventListener).toHaveBeenCalledOnce();
  });
});
