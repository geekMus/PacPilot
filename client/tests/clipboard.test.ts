import { afterEach, describe, expect, it, vi } from "vitest";
import { copyText } from "../src/utils/clipboard";

function setClipboard(writeText?: (text: string) => Promise<void>): void {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: writeText ? { writeText } : undefined,
  });
}

describe("copyText", () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, "clipboard");
  });

  it("uses the Clipboard API when it succeeds", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard(writeText);

    await expect(copyText("hello")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("hello");
  });

  it("returns false when the Clipboard API rejects", async () => {
    setClipboard(vi.fn().mockRejectedValue(new Error("permission denied")));

    await expect(copyText("hello")).resolves.toBe(false);
  });

  it("returns false when the Clipboard API is unavailable (insecure context)", async () => {
    setClipboard();

    await expect(copyText("hello")).resolves.toBe(false);
  });
});
