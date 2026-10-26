import { beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
}));

vi.mock("vue-sonner", () => ({ toast }));

async function loadToast() {
  vi.resetModules();
  const { markToastHostReady } = await import("../src/composables/toast-bridge");
  const { useToast } = await import("../src/composables/useToast");
  // 生产路径由 ToastHost 挂载完成后补投排队中的提示；这里模拟宿主已就绪。
  markToastHostReady();
  return useToast();
}

describe("useToast", () => {
  beforeEach(() => {
    toast.success.mockClear();
    toast.error.mockClear();
    toast.warning.mockClear();
    toast.info.mockClear();
  });

  it("dispatches each kind to the matching sonner helper", async () => {
    const { notify } = await loadToast();

    notify("saved", "success");
    notify("failed", "error");
    notify("careful", "warning");
    notify("fyi", "info");

    await vi.waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("saved", { duration: 4000 });
      expect(toast.error).toHaveBeenCalledWith("failed", { duration: 4000 });
      expect(toast.warning).toHaveBeenCalledWith("careful", { duration: 4000 });
      expect(toast.info).toHaveBeenCalledWith("fyi", { duration: 4000 });
    });
  });

  it("defaults to the info helper", async () => {
    const { notify } = await loadToast();

    notify("hello");

    await vi.waitFor(() => {
      expect(toast.info).toHaveBeenCalledWith("hello", { duration: 4000 });
    });
  });

  it("trims the message and ignores blank input", async () => {
    const { notify } = await loadToast();

    notify("  spaced  ");
    notify("   ");
    notify("");

    await vi.waitFor(() => {
      expect(toast.info).toHaveBeenCalledTimes(1);
      expect(toast.info).toHaveBeenCalledWith("spaced", { duration: 4000 });
    });
  });

  it("maps a non-positive duration to an infinite toast", async () => {
    const { notify } = await loadToast();

    notify("sticky", "warning", 0);
    notify("sticky too", "warning", -5);

    await vi.waitFor(() => {
      expect(toast.warning).toHaveBeenNthCalledWith(1, "sticky", { duration: Infinity });
      expect(toast.warning).toHaveBeenNthCalledWith(2, "sticky too", { duration: Infinity });
    });
  });

  it("honours a custom duration", async () => {
    const { notify } = await loadToast();

    notify("quick", "success", 1200);

    await vi.waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("quick", { duration: 1200 });
    });
  });
});
