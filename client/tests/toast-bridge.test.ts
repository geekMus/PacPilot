import { afterEach, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
}));

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("vue-sonner");
  toast.success.mockClear();
  toast.error.mockClear();
  toast.warning.mockClear();
  toast.info.mockClear();
});

describe("toast-bridge", () => {
  it("keeps a toast queued until the host is ready", async () => {
    vi.doMock("vue-sonner", () => ({ toast }));
    const bridge = await import("../src/composables/toast-bridge");

    let loaded = false;
    const stop = bridge.subscribeToastRuntime((value) => {
      loaded = value;
    });

    bridge.enqueueToast({ message: "已保存", kind: "success", duration: 4000 });
    await vi.waitFor(() => expect(loaded).toBe(true));

    // 运行时已经就绪，但宿主还没挂载：提示必须留在队列里，不能提前投递。
    expect(toast.success).not.toHaveBeenCalled();

    bridge.markToastHostReady();
    await vi.waitFor(() => expect(toast.success).toHaveBeenCalledWith("已保存", { duration: 4000 }));
    stop();
  });

  it("retries a toast when the runtime fails to load", async () => {
    let attempts = 0;
    vi.doMock("vue-sonner", () => {
      attempts += 1;
      if (attempts === 1) throw new Error("chunk load failed");
      return { toast };
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const bridge = await import("../src/composables/toast-bridge");

    bridge.enqueueToast({ message: "已保存", kind: "success", duration: 4000 });
    await vi.waitFor(() => expect(error).toHaveBeenCalled());

    // 加载失败不能把提示丢掉：它仍在队列里，加载恢复后补投。
    expect(error.mock.calls.some((call) => String(call[0]).includes("保留待重试"))).toBe(true);

    bridge.markToastHostReady();
    await vi.waitFor(() => expect(toast.success).toHaveBeenCalledWith("已保存", { duration: 4000 }));
  });
});
