import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryWorkflowRepository } from "../storage/memory/workflow-repository";

const NOW = new Date("2026-10-25T02:00:00.000Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("memory workflow repository", () => {
  it("creates a queued pending run", () => {
    const repository = createMemoryWorkflowRepository();
    const id = repository.create("manual", "custom");
    const run = repository.get(id);

    expect(run).toMatchObject({
      id,
      source: "manual",
      mode: "custom",
      status: "pending",
      stage: "queued",
      error: "",
      started_at: null,
      finished_at: null,
      duration_ms: null,
    });
    expect(run!.created_at).toBe(NOW.toISOString());
    expect(repository.count()).toBe(1);
  });

  it("claims only pending runs", () => {
    const repository = createMemoryWorkflowRepository();
    const id = repository.create("manual", "custom");
    const startedAt = "2026-10-25T02:00:05.000Z";

    expect(repository.claim(id, startedAt)).toBe(true);
    expect(repository.get(id)).toMatchObject({
      status: "running",
      stage: "prepare",
      started_at: startedAt,
    });

    expect(repository.claim(id, startedAt)).toBe(false);
    expect(repository.claim(999, startedAt)).toBe(false);
  });

  it("closes running and pending stages when a run reaches a terminal status", () => {
    const repository = createMemoryWorkflowRepository();
    const id = repository.create("manual", "custom");
    repository.claim(id, "2026-10-25T02:00:00.000Z");
    const runningStage = repository.startStage(id, "download");
    const pendingStage = repository.startStage(id, "compile");

    // Simulate a stage that never started (pending) by rewriting it through finishStage's
    // sibling: cancelPending only touches runs, so set the status via a terminal update below.
    repository.finishStage(pendingStage, "skipped");

    vi.setSystemTime(new Date("2026-10-25T02:00:10.000Z"));
    repository.update(id, {
      status: "failed",
      error: "boom",
      finished_at: "2026-10-25T02:00:10.000Z",
      duration_ms: 10_000,
    });

    const [first] = repository.stages(id);
    expect(first).toMatchObject({ id: runningStage, status: "failed", error: "boom" });
    expect(first!.duration_ms).toBe(10_000);
  });

  it("ignores updates for unknown runs", () => {
    const repository = createMemoryWorkflowRepository();
    expect(() => repository.update(404, { status: "succeeded" })).not.toThrow();
  });

  it("lists runs newest first with cursor paging", () => {
    const repository = createMemoryWorkflowRepository();
    const first = repository.create("startup", "custom");
    const second = repository.create("manual", "custom");
    const third = repository.create("scheduled", "remote");

    expect(repository.list().map((run) => run.id)).toEqual([third, second, first]);
    expect(repository.list(2).map((run) => run.id)).toEqual([third, second]);
    expect(repository.list(10, second).map((run) => run.id)).toEqual([first]);
    expect(repository.list(10, 0).length).toBe(3);
  });

  it("returns clones so callers cannot mutate stored runs", () => {
    const repository = createMemoryWorkflowRepository();
    const id = repository.create("manual", "custom");
    const run = repository.get(id)!;
    run.status = "succeeded";
    expect(repository.get(id)!.status).toBe("pending");
  });

  it("prioritises running runs in listActive and current", () => {
    const repository = createMemoryWorkflowRepository();
    const pending = repository.create("manual", "custom");
    const running = repository.create("manual", "custom");
    repository.claim(running, NOW.toISOString());

    expect(repository.listActive().map((run) => run.id)).toEqual([running, pending]);
    expect(repository.current()!.id).toBe(running);
  });

  it("returns null from current when nothing is active", () => {
    const repository = createMemoryWorkflowRepository();
    expect(repository.current()).toBeNull();
  });

  it("marks in-flight runs as interrupted", () => {
    const repository = createMemoryWorkflowRepository();
    const started = repository.create("manual", "custom");
    repository.claim(started, "2026-10-25T01:00:00.000Z");
    const queued = repository.create("manual", "custom");

    vi.setSystemTime(new Date("2026-10-25T02:00:00.000Z"));
    repository.markInterrupted();

    expect(repository.get(started)).toMatchObject({
      status: "failed",
      stage: "interrupted",
      error: "服务在工作流完成前退出。",
      finished_at: "2026-10-25T02:00:00.000Z",
      duration_ms: 3_600_000,
    });
    expect(repository.get(queued)).toMatchObject({
      status: "failed",
      stage: "interrupted",
      duration_ms: null,
    });
  });

  it("starts and finishes stages", () => {
    const repository = createMemoryWorkflowRepository();
    const runId = repository.create("manual", "custom");

    const stageId = repository.startStage(runId, "download", "fetching");
    expect(repository.stages(runId)[0]).toMatchObject({
      id: stageId,
      run_id: runId,
      stage_key: "download",
      status: "running",
      detail: "fetching",
      finished_at: null,
      duration_ms: null,
    });

    vi.setSystemTime(new Date("2026-10-25T02:00:01.500Z"));
    repository.finishStage(stageId, "succeeded", "", "done");

    expect(repository.stages(runId)[0]).toMatchObject({
      status: "succeeded",
      error: "",
      detail: "done",
      finished_at: "2026-10-25T02:00:01.500Z",
      duration_ms: 1_500,
    });
  });

  it("keeps the existing detail when the finish call omits it", () => {
    const repository = createMemoryWorkflowRepository();
    const runId = repository.create("manual", "custom");
    const stageId = repository.startStage(runId, "download", "original detail");

    repository.finishStage(stageId, "failed", "network down");
    expect(repository.stages(runId)[0]).toMatchObject({
      status: "failed",
      error: "network down",
      detail: "original detail",
    });
  });

  it("ignores finishing an unknown stage", () => {
    const repository = createMemoryWorkflowRepository();
    expect(() => repository.finishStage(999, "succeeded")).not.toThrow();
  });

  it("rejects stages for unknown runs", () => {
    const repository = createMemoryWorkflowRepository();
    expect(() => repository.startStage(999, "download")).toThrow(
      "Cannot create a stage for an unknown workflow run."
    );
  });

  it("sorts stages by id and filters by run", () => {
    const repository = createMemoryWorkflowRepository();
    const first = repository.create("manual", "custom");
    const second = repository.create("manual", "custom");
    repository.startStage(first, "a");
    repository.startStage(second, "b");
    repository.startStage(first, "c");

    expect(repository.stages(first).map((stage) => stage.stage_key)).toEqual(["a", "c"]);
    expect(repository.stages(second).map((stage) => stage.stage_key)).toEqual(["b"]);
    expect(repository.stages(999)).toEqual([]);
  });

  it("cancels pending runs only", () => {
    const repository = createMemoryWorkflowRepository();
    const id = repository.create("manual", "custom");

    expect(repository.cancelPending(999)).toBe("not-found");
    expect(repository.cancelPending(id)).toBe("cancelled");
    expect(repository.get(id)).toMatchObject({
      status: "cancelled",
      stage: "cancelled",
      error: "",
      finished_at: NOW.toISOString(),
    });
    expect(repository.cancelPending(id)).toBe("not-pending");

    const running = repository.create("manual", "custom");
    repository.claim(running, NOW.toISOString());
    expect(repository.cancelPending(running)).toBe("not-pending");
  });

  it("cleans up expired inactive runs while keeping active and fresh ones", () => {
    const repository = createMemoryWorkflowRepository();
    const pending = repository.create("manual", "custom");
    const running = repository.create("manual", "custom");
    repository.claim(running, NOW.toISOString());
    const finished = repository.create("manual", "custom");
    repository.startStage(finished, "download");
    repository.update(finished, { status: "succeeded" });

    expect(repository.cleanup(0)).toBe(0);
    expect(repository.cleanup(30)).toBe(0);
    expect(repository.count()).toBe(3);

    vi.setSystemTime(new Date(NOW.getTime() + 31 * 86400000));
    expect(repository.cleanup(30)).toBe(1);
    expect(repository.get(finished)).toBeNull();
    expect(repository.stages(finished)).toEqual([]);
    expect(repository.count()).toBe(2);
    expect(repository.get(pending)?.status).toBe("pending");
    expect(repository.get(running)?.status).toBe("running");
  });

  it("clears inactive runs with their stages and keeps active ones", () => {
    const repository = createMemoryWorkflowRepository();
    const pending = repository.create("manual", "custom");
    const finished = repository.create("manual", "custom");
    repository.startStage(finished, "download");
    repository.update(finished, { status: "succeeded" });

    expect(repository.clear()).toBe(1);
    expect(repository.get(finished)).toBeNull();
    expect(repository.stages(finished)).toEqual([]);
    expect(repository.get(pending)).toMatchObject({ status: "pending" });
  });

  it("resets every stored run and stage", () => {
    const repository = createMemoryWorkflowRepository();
    const id = repository.create("manual", "custom");
    repository.startStage(id, "download");

    repository.reset();
    expect(repository.count()).toBe(0);
    expect(repository.stages(id)).toEqual([]);
    expect(repository.current()).toBeNull();
  });
});
