import { effectScope } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCopyFeedback } from "../src/composables/useCopyFeedback";
import { copyText } from "../src/utils/clipboard";

vi.mock("../src/utils/clipboard", () => ({
  copyText: vi.fn(),
}));

const mockedCopyText = vi.mocked(copyText);

describe("useCopyFeedback", () => {
  let scope: ReturnType<typeof effectScope>;
  let feedback: ReturnType<typeof useCopyFeedback>;

  beforeEach(() => {
    vi.useFakeTimers();
    scope = effectScope();
    scope.run(() => {
      feedback = useCopyFeedback();
    });
  });

  afterEach(() => {
    scope.stop();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("shows success and resets it automatically", async () => {
    mockedCopyText.mockResolvedValue(true);

    await expect(feedback.copyWithFeedback("hello")).resolves.toBe(true);
    expect(feedback.copyState.value).toBe("success");

    vi.advanceTimersByTime(1800);
    expect(feedback.copyState.value).toBeNull();
  });

  it("shows an error when copying fails", async () => {
    mockedCopyText.mockResolvedValue(false);

    await expect(feedback.copyWithFeedback("hello")).resolves.toBe(false);
    expect(feedback.copyState.value).toBe("error");
  });

  it("treats unexpected clipboard errors as failures", async () => {
    mockedCopyText.mockRejectedValue(new Error("clipboard unavailable"));

    await expect(feedback.copyWithFeedback("hello")).resolves.toBe(false);
    expect(feedback.copyState.value).toBe("error");
  });

  it("clears feedback and pending timers when reset", async () => {
    mockedCopyText.mockResolvedValue(true);
    await feedback.copyWithFeedback("hello");

    feedback.resetCopyState();
    expect(feedback.copyState.value).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});
