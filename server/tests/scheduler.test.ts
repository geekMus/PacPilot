import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../domain/settings";
import { createMemoryApplicationStorage } from "../storage/memory/application-storage";

type FakeTask = {
  expression: string;
  callback: () => Promise<void>;
  options: { timezone?: string } | undefined;
  stop: ReturnType<typeof vi.fn>;
};

const state = vi.hoisted(() => ({
  tasks: [] as FakeTask[],
  scheduleCalls: [] as Array<{ expression: string; options: unknown }>,
  validateResult: true,
}));

const workflow = vi.hoisted(() => ({
  runPacWorkflow: vi.fn(),
  hasActivePacWorkflow: vi.fn(),
}));

const remote = vi.hoisted(() => ({
  refreshRemoteRules: vi.fn(),
}));

vi.mock("node-cron", () => ({
  default: {
    validate: (expression: string) => (expression ? state.validateResult : false),
    schedule: (expression: string, callback: () => Promise<void>, options: unknown) => {
      const task: FakeTask = {
        expression,
        callback,
        options: options as { timezone?: string },
        stop: vi.fn(),
      };
      state.tasks.push(task);
      state.scheduleCalls.push({ expression, options });
      return task;
    },
  },
}));

vi.mock("../services/workflow", () => ({
  runPacWorkflow: workflow.runPacWorkflow,
  hasActivePacWorkflow: workflow.hasActivePacWorkflow,
}));

vi.mock("../services/pac-generator", () => ({
  refreshRemoteRules: remote.refreshRemoteRules,
}));

async function loadScheduler() {
  vi.resetModules();
  return await import("../services/scheduler");
}

async function makeStorage(overrides: Record<string, unknown> = {}) {
  const storage = await createMemoryApplicationStorage();
  await storage.settings.set({
    ...DEFAULT_SETTINGS,
    cronSchedule: "0 3 * * *",
    timezone: "Asia/Shanghai",
    ...overrides,
  });
  return storage;
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  state.tasks = [];
  state.scheduleCalls = [];
  state.validateResult = true;
  workflow.runPacWorkflow.mockReset();
  workflow.runPacWorkflow.mockResolvedValue({
    success: true,
    mode: "custom",
    message: "ok",
    resultCode: "ok",
  });
  workflow.hasActivePacWorkflow.mockReset();
  workflow.hasActivePacWorkflow.mockResolvedValue(false);
  remote.refreshRemoteRules.mockReset();
  remote.refreshRemoteRules.mockResolvedValue({ ok: true, message: "" });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("reschedule", () => {
  it("does nothing when no cron expression is configured", async () => {
    const scheduler = await loadScheduler();
    const storage = await makeStorage({ cronSchedule: "   " });

    await scheduler.reschedule(storage, "/tmp/data");

    expect(state.tasks).toHaveLength(0);
    await storage.close();
  });

  it("logs an error and schedules nothing for an invalid expression", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    state.validateResult = false;
    const scheduler = await loadScheduler();
    const storage = await makeStorage({ cronSchedule: "not a cron" });

    await scheduler.reschedule(storage, "/tmp/data");

    expect(state.tasks).toHaveLength(0);
    expect(String(error.mock.calls[0]!.join(" "))).toContain(
      "Invalid scheduled task expression: not a cron"
    );
    await storage.close();
  });

  it("schedules the task with the configured expression and timezone", async () => {
    const scheduler = await loadScheduler();
    const storage = await makeStorage({ cronSchedule: "15 4 * * *", timezone: "Asia/Tokyo" });

    await scheduler.reschedule(storage, "/tmp/data");

    expect(state.tasks).toHaveLength(1);
    expect(state.scheduleCalls[0]).toEqual({
      expression: "15 4 * * *",
      options: { timezone: "Asia/Tokyo" },
    });
    await storage.close();
  });

  it("keeps the existing task when the expression and timezone are unchanged", async () => {
    const scheduler = await loadScheduler();
    const storage = await makeStorage();

    await scheduler.reschedule(storage, "/tmp/data");
    await scheduler.reschedule(storage, "/tmp/data");

    expect(state.tasks).toHaveLength(1);
    expect(state.tasks[0]!.stop).not.toHaveBeenCalled();
    await storage.close();
  });

  it("replaces the task when the expression changes", async () => {
    const scheduler = await loadScheduler();
    const storage = await makeStorage({ cronSchedule: "0 3 * * *" });

    await scheduler.reschedule(storage, "/tmp/data");
    await storage.settings.update({ cronSchedule: "0 5 * * *" });
    await scheduler.reschedule(storage, "/tmp/data");

    expect(state.tasks).toHaveLength(2);
    expect(state.tasks[0]!.stop).toHaveBeenCalledTimes(1);
    expect(state.tasks[1]!.expression).toBe("0 5 * * *");
    await storage.close();
  });

  it("replaces the task when only the timezone changes", async () => {
    const scheduler = await loadScheduler();
    const storage = await makeStorage({ timezone: "Asia/Shanghai" });

    await scheduler.reschedule(storage, "/tmp/data");
    await storage.settings.update({ timezone: "Europe/Berlin" });
    await scheduler.reschedule(storage, "/tmp/data");

    expect(state.tasks).toHaveLength(2);
    expect(state.tasks[1]!.options).toEqual({ timezone: "Europe/Berlin" });
    await storage.close();
  });

  it("stops the task when the expression is cleared", async () => {
    const scheduler = await loadScheduler();
    const storage = await makeStorage();

    await scheduler.reschedule(storage, "/tmp/data");
    await storage.settings.update({ cronSchedule: "" });
    await scheduler.reschedule(storage, "/tmp/data");

    expect(state.tasks).toHaveLength(1);
    expect(state.tasks[0]!.stop).toHaveBeenCalledTimes(1);
    await storage.close();
  });
});

describe("stopScheduler", () => {
  it("stops the active task and allows a fresh schedule for the same key", async () => {
    const scheduler = await loadScheduler();
    const storage = await makeStorage();

    await scheduler.reschedule(storage, "/tmp/data");
    scheduler.stopScheduler();

    expect(state.tasks[0]!.stop).toHaveBeenCalledTimes(1);

    await scheduler.reschedule(storage, "/tmp/data");
    expect(state.tasks).toHaveLength(2);
    await storage.close();
  });

  it("is a no-op when nothing is scheduled", async () => {
    const scheduler = await loadScheduler();
    expect(() => scheduler.stopScheduler()).not.toThrow();
  });
});

describe("scheduled tick", () => {
  it("refreshes remote rules before triggering the workflow", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const scheduler = await loadScheduler();
    const storage = await makeStorage({
      mode: "remote",
      listUrl: "https://example.com/gfwlist.txt",
    });
    await scheduler.reschedule(storage, "/tmp/data");

    await state.tasks[0]!.callback();

    expect(remote.refreshRemoteRules).toHaveBeenCalledTimes(1);
    expect(workflow.runPacWorkflow).toHaveBeenCalledWith(storage, "/tmp/data", "scheduled");
    expect(String(info.mock.calls[0]!.join(" "))).toContain(
      "Scheduled remote rule refresh completed."
    );
    await storage.close();
  });

  it("skips the refresh in custom mode", async () => {
    const scheduler = await loadScheduler();
    const storage = await makeStorage({ mode: "custom" });
    await scheduler.reschedule(storage, "/tmp/data");

    await state.tasks[0]!.callback();

    expect(remote.refreshRemoteRules).not.toHaveBeenCalled();
    expect(workflow.runPacWorkflow).toHaveBeenCalledTimes(1);
    await storage.close();
  });

  it("skips the refresh when the remote list URL is blank", async () => {
    const scheduler = await loadScheduler();
    const storage = await makeStorage({ mode: "remote", listUrl: "   " });
    await scheduler.reschedule(storage, "/tmp/data");

    await state.tasks[0]!.callback();

    expect(remote.refreshRemoteRules).not.toHaveBeenCalled();
    await storage.close();
  });

  it("warns when a refresh is already running", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const scheduler = await loadScheduler();
    const storage = await makeStorage({
      mode: "remote",
      listUrl: "https://example.com/gfwlist.txt",
    });
    let release!: () => void;
    remote.refreshRemoteRules.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ ok: true, message: "" });
        })
    );
    await scheduler.reschedule(storage, "/tmp/data");

    const first = state.tasks[0]!.callback();
    await flush();
    const second = state.tasks[0]!.callback();
    await flush();

    expect(
      warn.mock.calls.some((call) =>
        String(call.join(" ")).includes("Previous remote rule refresh is still running")
      )
    ).toBe(true);

    release();
    await first;
    await second;
    await storage.close();
  });

  it("warns when the refresh fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    remote.refreshRemoteRules.mockResolvedValue({ ok: false, message: "upstream down" });
    const scheduler = await loadScheduler();
    const storage = await makeStorage({
      mode: "remote",
      listUrl: "https://example.com/gfwlist.txt",
    });
    await scheduler.reschedule(storage, "/tmp/data");

    await state.tasks[0]!.callback();

    expect(
      warn.mock.calls.some((call) =>
        String(call.join(" ")).includes("Scheduled remote rule refresh failed: upstream down")
      )
    ).toBe(true);
    await storage.close();
  });

  it("skips the workflow while another scheduled run is in flight and warns only once", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const scheduler = await loadScheduler();
    const storage = await makeStorage({ mode: "custom" });
    let release!: () => void;
    workflow.runPacWorkflow.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () =>
            resolve({ success: true, mode: "custom", message: "ok", resultCode: "ok" });
        })
    );
    await scheduler.reschedule(storage, "/tmp/data");

    const first = state.tasks[0]!.callback();
    await flush();
    await state.tasks[0]!.callback();
    await state.tasks[0]!.callback();

    expect(workflow.runPacWorkflow).toHaveBeenCalledTimes(1);
    const overlapWarnings = warn.mock.calls.filter((call) =>
      String(call.join(" ")).includes("Previous workflow is still running")
    );
    expect(overlapWarnings).toHaveLength(1);

    release();
    await first;
    await flush();
    await storage.close();
  });

  it("skips the workflow when a workflow is already active", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    workflow.hasActivePacWorkflow.mockResolvedValue(true);
    const scheduler = await loadScheduler();
    const storage = await makeStorage({ mode: "custom" });
    await scheduler.reschedule(storage, "/tmp/data");

    await state.tasks[0]!.callback();

    expect(workflow.runPacWorkflow).not.toHaveBeenCalled();
    expect(
      warn.mock.calls.some((call) =>
        String(call.join(" ")).includes("Previous workflow is still running")
      )
    ).toBe(true);
    await storage.close();
  });

  it("runs again after the in-flight flag clears", async () => {
    const scheduler = await loadScheduler();
    const storage = await makeStorage({ mode: "custom" });
    await scheduler.reschedule(storage, "/tmp/data");

    await state.tasks[0]!.callback();
    await flush();
    await state.tasks[0]!.callback();
    await flush();

    expect(workflow.runPacWorkflow).toHaveBeenCalledTimes(2);
    await storage.close();
  });

  it("logs scheduled workflow failures instead of throwing", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    workflow.runPacWorkflow.mockRejectedValue(new Error("scheduled boom"));
    const scheduler = await loadScheduler();
    const storage = await makeStorage({ mode: "custom" });
    await scheduler.reschedule(storage, "/tmp/data");

    await state.tasks[0]!.callback();
    await flush();

    expect(
      error.mock.calls.some((call) => String(call.join(" ")).includes("Scheduled workflow failed"))
    ).toBe(true);
    await storage.close();
  });
});
