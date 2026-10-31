import { describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import { mount } from "@vue/test-utils";
import { i18n, setAppLocale } from "../src/i18n";
import { useWorkflowLabels } from "../src/composables/useWorkflowLabels";
import type { WorkflowRun } from "../src/api/client";

function captureLabels() {
  let labels: ReturnType<typeof useWorkflowLabels> | null = null;
  const wrapper = mount(
    defineComponent({
      setup() {
        labels = useWorkflowLabels();
        return () => null;
      },
    }),
    { global: { plugins: [i18n] } }
  );
  return { labels: labels as unknown as ReturnType<typeof useWorkflowLabels>, wrapper };
}

function run(overrides: Partial<WorkflowRun> = {}): WorkflowRun {
  return {
    id: 1,
    source: "manual",
    mode: "custom",
    status: "succeeded",
    stage: "generate-pac",
    error: "",
    detail: "",
    created_at: "2026-10-25T00:00:00.000Z",
    started_at: "2026-10-25T00:00:00.000Z",
    finished_at: "2026-10-25T00:00:01.000Z",
    duration_ms: 1000,
    ...overrides,
  } as WorkflowRun;
}

describe("useWorkflowLabels", () => {
  it("maps known statuses and falls back to the raw value", () => {
    setAppLocale("zh_CN");
    const { labels, wrapper } = captureLabels();

    expect(labels.statusLabel("running")).not.toBe("running");
    expect(labels.statusLabel("running").length).toBeGreaterThan(0);
    expect(labels.statusLabel("mystery")).toBe("mystery");

    wrapper.unmount();
  });

  it("assigns a tone per status and never marks in-progress runs as failures", () => {
    setAppLocale("zh_CN");
    const { labels, wrapper } = captureLabels();

    expect(labels.statusTone("succeeded")).toBe("good");
    expect(labels.statusTone("failed")).toBe("bad");
    expect(labels.statusTone("running")).toBe("running");
    expect(labels.statusTone("pending")).toBe("pending");
    expect(labels.statusTone("cancelled")).toBe("idle");
    expect(labels.statusTone("mystery")).toBe("idle");

    wrapper.unmount();
  });

  it("picks an icon per status with a spinner for running and a clock for pending", () => {
    setAppLocale("zh_CN");
    const { labels, wrapper } = captureLabels();

    expect(labels.statusIcon("succeeded")).toBe("circle-check");
    expect(labels.statusIcon("failed")).toBe("circle-x");
    expect(labels.statusIcon("running")).toBe("loader-circle");
    expect(labels.statusIcon("pending")).toBe("clock");
    expect(labels.statusIcon("cancelled")).toBe("circle");
    expect(labels.statusIcon("mystery")).toBe("circle");

    wrapper.unmount();
  });

  it("maps known sources and falls back to the raw value", () => {
    setAppLocale("zh_CN");
    const { labels, wrapper } = captureLabels();

    expect(labels.sourceLabel("scheduled")).not.toBe("scheduled");
    expect(labels.sourceLabel("unknown-source")).toBe("unknown-source");

    wrapper.unmount();
  });

  it("resolves stage labels through the i18n key", () => {
    setAppLocale("zh_CN");
    const { labels, wrapper } = captureLabels();

    expect(labels.stageLabel("prepare")).toBe(i18n.global.t("workflow.stageNames.prepare"));

    wrapper.unmount();
  });

  it("maps both known modes and falls back for empty values", () => {
    setAppLocale("zh_CN");
    const { labels, wrapper } = captureLabels();

    expect(labels.modeLabel("remote")).toBe(i18n.global.t("workflowPage.k9"));
    expect(labels.modeLabel("custom")).toBe(i18n.global.t("workflowPage.k10"));
    expect(labels.modeLabel("")).toBe("—");
    expect(labels.modeLabel("weird")).toBe("weird");

    wrapper.unmount();
  });

  it("formats durations across every bucket", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-25T00:00:10.000Z"));
    const { labels, wrapper } = captureLabels();

    expect(labels.durationLabel(run({ duration_ms: 250 }))).toBe("250 ms");
    expect(labels.durationLabel(run({ duration_ms: 1500 }))).toBe(
      i18n.global.t("workflowPage.sec", { n: "1.5" })
    );
    expect(labels.durationLabel(run({ duration_ms: 65_000 }))).toBe(
      i18n.global.t("workflowPage.minSec", { m: 1, s: 5 })
    );
    expect(labels.durationLabel(run({ duration_ms: null, started_at: null }))).toBe("—");

    wrapper.unmount();
    vi.useRealTimers();
  });

  it("derives a live duration from started_at when duration_ms is absent", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-25T00:00:02.500Z"));
    const { labels, wrapper } = captureLabels();

    expect(
      labels.durationLabel(run({ duration_ms: null, started_at: "2026-10-25T00:00:00.000Z" }))
    ).toBe(i18n.global.t("workflowPage.sec", { n: "2.5" }));

    wrapper.unmount();
    vi.useRealTimers();
  });

  it("formats dates for both locales and falls back to a dash", async () => {
    await setAppLocale("zh_CN");
    const { labels, wrapper } = captureLabels();
    const zh = labels.dateLabel("2026-10-25T00:00:00.000Z");

    // 英文目录按需下载，切换语言因此是异步的。
    await setAppLocale("en_US");
    const en = labels.dateLabel("2026-10-25T00:00:00.000Z");

    expect(zh).not.toBe("—");
    expect(en).not.toBe("—");
    expect(zh).not.toBe(en);
    expect(labels.dateLabel(null)).toBe("—");

    wrapper.unmount();
    await setAppLocale("zh_CN");
  });
});
