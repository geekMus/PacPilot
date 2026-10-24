import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, nextTick, ref, type Ref } from "vue";
import { mount } from "@vue/test-utils";
import { useViewportPanel } from "../src/composables/useViewportPanel";

const VIEWPORT_WIDTH = 1000;
const VIEWPORT_HEIGHT = 800;

interface Rect {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
}

function rect(overrides: Partial<Rect> = {}): Rect {
  const base: Rect = {
    top: 100,
    bottom: 140,
    left: 100,
    right: 300,
    width: 200,
    height: 40,
  };
  const merged = { ...base, ...overrides };
  merged.width = merged.right - merged.left;
  merged.height = merged.bottom - merged.top;
  return merged;
}

function fakeElement(bounds: Rect, scrollHeight = 200): HTMLElement {
  return {
    getBoundingClientRect: () => bounds,
    scrollHeight,
  } as unknown as HTMLElement;
}

interface Harness {
  style: Ref<Record<string, unknown>>;
  updatePosition: () => Promise<void>;
  open: Ref<boolean>;
  unmount: () => void;
}

function setup(options: {
  anchor?: HTMLElement | null;
  panel?: HTMLElement | null;
  open?: boolean;
  config?: Parameters<typeof useViewportPanel>[3];
}): Harness {
  const anchor = ref<HTMLElement | null>(options.anchor ?? null);
  const panel = ref<HTMLElement | null>(options.panel ?? null);
  const open = ref(options.open ?? true);
  let style: Ref<Record<string, unknown>> = ref({});
  let updatePosition: () => Promise<void> = async () => undefined;

  const wrapper = mount(
    defineComponent({
      setup() {
        const api = useViewportPanel(anchor, panel, open, options.config);
        style = api.style as unknown as Ref<Record<string, unknown>>;
        updatePosition = api.updatePosition;
        return () => null;
      },
    })
  );

  return { style, updatePosition, open, unmount: () => wrapper.unmount() };
}

async function flush(): Promise<void> {
  await nextTick();
  await nextTick();
  await Promise.resolve();
}

beforeEach(() => {
  Object.defineProperty(document.documentElement, "clientWidth", {
    configurable: true,
    value: VIEWPORT_WIDTH,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: VIEWPORT_HEIGHT,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useViewportPanel", () => {
  it("stays hidden until both elements are available", async () => {
    const harness = setup({ anchor: null, panel: null });

    await harness.updatePosition();

    expect(harness.style.value).toEqual({ visibility: "hidden" });
    harness.unmount();
  });

  it("does nothing while the panel is closed", async () => {
    const harness = setup({
      anchor: fakeElement(rect()),
      panel: fakeElement(rect()),
      open: false,
    });

    await harness.updatePosition();

    expect(harness.style.value).toEqual({ visibility: "hidden" });
    harness.unmount();
  });

  it("places the panel below the anchor and caps the width", async () => {
    const harness = setup({
      anchor: fakeElement(rect({ top: 100, bottom: 140, left: 100, right: 300 })),
      panel: fakeElement(rect(), 120),
    });

    await harness.updatePosition();

    expect(harness.style.value).toMatchObject({
      position: "fixed",
      left: "100px",
      top: "148px",
      width: "320px",
      maxHeight: "640px",
      visibility: "visible",
      overflowY: "auto",
    });
    harness.unmount();
  });

  it("flips above the anchor when there is no room below", async () => {
    const harness = setup({
      anchor: fakeElement(rect({ top: 700, bottom: 760, left: 100, right: 300 })),
      panel: fakeElement(rect(), 300),
    });

    await harness.updatePosition();

    expect(harness.style.value).toMatchObject({
      top: "392px",
      maxHeight: "680px",
      visibility: "visible",
    });
    harness.unmount();
  });

  it("aligns to the anchor's right edge and can match its width", async () => {
    const harness = setup({
      anchor: fakeElement(rect({ top: 100, bottom: 140, left: 600, right: 900 })),
      panel: fakeElement(rect(), 100),
      config: { align: "end", matchAnchorWidth: true },
    });

    await harness.updatePosition();

    expect(harness.style.value).toMatchObject({ left: "600px", width: "300px" });
    harness.unmount();
  });

  it("clamps a right-aligned panel into the viewport", async () => {
    const harness = setup({
      anchor: fakeElement(rect({ top: 100, bottom: 140, left: 900, right: 1200 })),
      panel: fakeElement(rect(), 100),
      config: { align: "end", maxWidth: 400 },
    });

    await harness.updatePosition();

    expect(harness.style.value).toMatchObject({ left: "588px", width: "400px" });
    harness.unmount();
  });

  it("shrinks the horizontal margin on very narrow viewports", async () => {
    Object.defineProperty(document.documentElement, "clientWidth", {
      configurable: true,
      value: 16,
    });
    const harness = setup({
      anchor: fakeElement(rect({ top: 100, bottom: 140, left: 0, right: 10 })),
      panel: fakeElement(rect(), 100),
      config: { margin: 40, maxWidth: 320 },
    });

    await harness.updatePosition();

    expect(harness.style.value).toMatchObject({ left: "8px", width: "0px" });
    harness.unmount();
  });

  it("honours a configured maxHeight", async () => {
    const harness = setup({
      anchor: fakeElement(rect({ top: 100, bottom: 140 })),
      panel: fakeElement(rect(), 2000),
      config: { maxHeight: 240 },
    });

    await harness.updatePosition();

    expect(harness.style.value).toMatchObject({ maxHeight: "240px" });
    harness.unmount();
  });

  it("recomputes on window resize and scroll while open", async () => {
    const anchorElement = fakeElement(rect({ top: 100, bottom: 140 }));
    const harness = setup({ anchor: anchorElement, panel: fakeElement(rect(), 500) });
    await flush();
    await harness.updatePosition();
    expect(harness.style.value.maxHeight).toBe("640px");

    Object.defineProperty(window, "innerHeight", { configurable: true, value: 400 });
    window.dispatchEvent(new Event("resize"));
    await flush();

    expect(harness.style.value.maxHeight).toBe("240px");
    harness.unmount();
  });

  it("stops listening once the panel closes", async () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const harness = setup({
      anchor: fakeElement(rect()),
      panel: fakeElement(rect(), 100),
      open: false,
    });
    await nextTick();

    harness.open.value = true;
    await nextTick();
    harness.open.value = false;
    await nextTick();

    expect(harness.style.value).toEqual({ visibility: "hidden" });
    expect(removeSpy).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith("scroll", expect.any(Function), true);
    harness.unmount();
  });

  it("does not double-register listeners when opened repeatedly", async () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    const harness = setup({
      anchor: fakeElement(rect()),
      panel: fakeElement(rect(), 100),
      open: true,
    });
    await nextTick();

    window.dispatchEvent(new Event("resize"));
    await nextTick();

    const resizeCalls = addSpy.mock.calls.filter(([name]) => name === "resize");
    expect(resizeCalls.length).toBeLessThanOrEqual(2);
    harness.unmount();
  });
});
