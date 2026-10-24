import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../domain/settings";
import { createMemoryApplicationStorage } from "../storage/memory/application-storage";
import { hasActivePacWorkflow, runPacWorkflow, startPacWorkflow } from "../services/workflow";
import { invalidateRenderedPac } from "../services/pac-runtime";
import type { ApplicationStorage } from "../storage/repositories";

async function storageWith(overrides: Record<string, unknown> = {}) {
  const storage = await createMemoryApplicationStorage();
  await storage.settings.set({
    ...DEFAULT_SETTINGS,
    pacCompress: false,
    blockList: ["blocked.example"],
    ...overrides,
  });
  // Mark the notification document as already migrated so publishing events never has to
  // read the settings document; otherwise a failing settings read would silently drop events.
  await storage.notifications.set({
    schemaVersion: 1,
    legacyMigrated: true,
    channels: [],
    rules: [],
    events: [],
    deliveries: [],
  });
  return storage;
}

function waitFor(predicate: () => boolean | Promise<boolean>, timeoutMs = 2000): Promise<void> {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      if (await predicate()) {
        resolve();
        return;
      }
      if (Date.now() - started > timeoutMs) {
        reject(new Error("Timed out waiting for the workflow to settle."));
        return;
      }
      setTimeout(tick, 5);
    };
    void tick();
  });
}

beforeEach(() => {
  invalidateRenderedPac();
});

afterEach(() => {
  invalidateRenderedPac();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("runPacWorkflow", () => {
  it("records a successful run with stages and notifications", async () => {
    const storage = await storageWith();
    const result = await runPacWorkflow(storage, "/tmp/data", "manual");

    expect(result.generation.success).toBe(true);
    expect(result.workflowId).toBeGreaterThan(0);

    const run = await storage.workflows.get(result.workflowId);
    expect(run).toMatchObject({
      status: "succeeded",
      stage: "done",
      source: "manual",
      mode: "custom",
      error: "",
    });
    expect(run!.duration_ms).toBeGreaterThanOrEqual(0);
    expect(run!.started_at).toBeTruthy();
    expect(run!.finished_at).toBeTruthy();

    const stages = await storage.workflows.stages(result.workflowId);
    expect(stages.map((stage) => stage.stage_key)).toEqual(["prepare", "generate-pac"]);
    expect(stages.every((stage) => stage.status === "succeeded")).toBe(true);

    const prepareDetail = JSON.parse(stages[0]!.detail);
    expect(prepareDetail).toMatchObject({
      mode: "custom",
      block_list_count: 1,
      direct_list_count: 0,
      data_dir: "/tmp/data",
      cron_schedule: null,
    });

    const document = await storage.notifications.get();
    expect(document.events.map((event) => event.phase)).toEqual(["started", "finished"]);
    expect(document.events[1]).toMatchObject({
      type: "task.execution",
      outcome: "success",
      correlationId: `workflow-${result.workflowId}`,
    });
    await storage.close();
  });

  it("records a failed run when generation fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const storage = await storageWith({ pacProxy: "TUNNEL 1.2.3.4:80" });
    const result = await runPacWorkflow(storage, "/tmp/data", "scheduled");

    expect(result.generation.success).toBe(false);
    const run = await storage.workflows.get(result.workflowId);
    expect(run).toMatchObject({ status: "failed", stage: "failed" });
    expect(run!.error).toContain("格式无效");

    const stages = await storage.workflows.stages(result.workflowId);
    expect(stages.map((stage) => [stage.stage_key, stage.status])).toEqual([
      ["prepare", "succeeded"],
      ["generate-pac", "failed"],
    ]);

    const document = await storage.notifications.get();
    expect(document.events[1]).toMatchObject({ phase: "finished", outcome: "failure" });
    await storage.close();
  });

  it("records the exception stage when a step throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const storage = await storageWith();
    // The first settings read happens while enqueueing (to capture the mode); fail the
    // read that executePacWorkflow performs once the run has been claimed.
    failSettingsAfterFirstRead(storage);

    await expect(runPacWorkflow(storage, "/tmp/data", "manual")).rejects.toThrow(
      "settings exploded"
    );

    const runs = await storage.workflows.list();
    expect(runs[0]).toMatchObject({
      status: "failed",
      stage: "exception",
      error: "settings exploded",
    });

    const document = await storage.notifications.get();
    expect(document.events).toHaveLength(1);
    expect(document.events[0]).toMatchObject({ phase: "finished", outcome: "failure" });
    await storage.close();
  });

  it("still publishes a failure event when saving the failure status also fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const storage = await storageWith();
    failSettingsAfterFirstRead(storage);
    vi.spyOn(storage.workflows, "update").mockRejectedValue(new Error("cannot update"));

    await expect(runPacWorkflow(storage, "/tmp/data", "manual")).rejects.toThrow(
      "settings exploded"
    );

    const document = await storage.notifications.get();
    expect(document.events).toHaveLength(1);
    await storage.close();
  });

  it("returns a cancelled result when the run was cancelled before it started", async () => {
    const storage = await storageWith();
    const blocked = await blockQueue(storage);

    const first = startPacWorkflow(storage, "/tmp/data", "manual");
    const second = startPacWorkflow(storage, "/tmp/data", "manual");
    const firstId = await first;
    const secondId = await second;

    // Cancel the queued second run before the queue reaches it.
    await storage.workflows.cancelPending(secondId);
    blocked.release();

    await waitFor(async () => (await storage.workflows.get(firstId))?.status === "succeeded");
    await waitFor(async () => (await storage.workflows.get(secondId))?.status === "cancelled");

    expect((await storage.workflows.get(secondId))!.status).toBe("cancelled");
    await storage.close();
  });
});

describe("startPacWorkflow", () => {
  it("returns immediately and runs in the background", async () => {
    const storage = await storageWith();
    const id = await startPacWorkflow(storage, "/tmp/data", "save-and-generate");

    expect(typeof id).toBe("number");
    const initial = await storage.workflows.get(id);
    expect(["pending", "running", "succeeded"]).toContain(initial!.status);

    await waitFor(async () => (await storage.workflows.get(id))?.status === "succeeded");
    expect((await storage.workflows.get(id))!.source).toBe("save-and-generate");
    await storage.close();
  });

  it("logs background failures instead of throwing", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const storage = await storageWith();
    failSettingsAfterFirstRead(storage);

    await startPacWorkflow(storage, "/tmp/data", "manual");
    await waitFor(() =>
      error.mock.calls.some((call) => String(call.join(" ")).includes("Workflow execution failed"))
    );
    await storage.close();
  });
});

describe("hasActivePacWorkflow", () => {
  it("reports whether any run is pending or running", async () => {
    const storage = await storageWith();
    expect(await hasActivePacWorkflow(storage)).toBe(false);

    const id = await storage.workflows.create("manual", "custom");
    expect(await hasActivePacWorkflow(storage)).toBe(true);

    await storage.workflows.update(id, { status: "succeeded" });
    expect(await hasActivePacWorkflow(storage)).toBe(false);
    await storage.close();
  });
});

describe("queue serialization", () => {
  it("runs queued workflows one after another", async () => {
    const storage = await storageWith();
    const order: number[] = [];
    const original = storage.workflows.claim.bind(storage.workflows);
    vi.spyOn(storage.workflows, "claim").mockImplementation(async (id, startedAt) => {
      order.push(id);
      return original(id, startedAt);
    });

    const [first, second, third] = await Promise.all([
      startPacWorkflow(storage, "/tmp/data", "manual"),
      startPacWorkflow(storage, "/tmp/data", "manual"),
      startPacWorkflow(storage, "/tmp/data", "manual"),
    ]);

    await waitFor(async () => (await storage.workflows.get(third))?.status === "succeeded");
    expect(order).toEqual([first, second, third]);
    await storage.close();
  });
});

/** Let the enqueue-time settings read succeed, then fail every later read. */
function failSettingsAfterFirstRead(storage: ApplicationStorage): void {
  const original = storage.settings.get.bind(storage.settings);
  let reads = 0;
  vi.spyOn(storage.settings, "get").mockImplementation(async () => {
    reads += 1;
    if (reads > 1) throw new Error("settings exploded");
    return await original();
  });
}

/** Block the workflow queue by occupying it with a run whose claim never resolves. */ async function blockQueue(
  storage: ApplicationStorage
): Promise<{ release: () => void }> {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const original = storage.workflows.claim.bind(storage.workflows);
  let firstCall = true;
  vi.spyOn(storage.workflows, "claim").mockImplementation(async (id, startedAt) => {
    if (firstCall) {
      firstCall = false;
      await gate;
    }
    return original(id, startedAt);
  });
  return { release };
}
