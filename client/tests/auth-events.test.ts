import { describe, expect, it, vi } from "vitest";

describe("auth events", () => {
  it("does nothing when no handler is registered", async () => {
    vi.resetModules();
    const { emitUnauthorized } = await import("../src/api/auth-events");
    expect(() => emitUnauthorized()).not.toThrow();
  });

  it("invokes the most recently registered handler", async () => {
    vi.resetModules();
    const { emitUnauthorized, onUnauthorized } = await import("../src/api/auth-events");
    const first = vi.fn();
    const second = vi.fn();

    onUnauthorized(first);
    emitUnauthorized();
    expect(first).toHaveBeenCalledTimes(1);

    onUnauthorized(second);
    emitUnauthorized();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });
});
