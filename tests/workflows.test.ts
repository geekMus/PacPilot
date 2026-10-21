import { afterEach, describe, expect, test } from "bun:test";
import {
  cancelPendingWorkflow,
  claimWorkflowRun,
  createDatabase,
  createWorkflowRun,
  getWorkflowRun,
  markInterruptedWorkflows,
} from "../server/db/sqlite";
import type { AppDatabase } from "../server/db/sqlite";

let database: AppDatabase | null = null;

afterEach(() => {
  database?.close();
  database = null;
});

describe("workflow run state transitions", () => {
  function setup(): AppDatabase {
    database = createDatabase(":memory:");
    return database;
  }

  test("claims a pending run exactly once", () => {
    const db = setup();
    const id = createWorkflowRun(db, "manual", "custom");
    const startedAt = new Date().toISOString();

    expect(claimWorkflowRun(db, id, startedAt)).toBe(true);
    expect(claimWorkflowRun(db, id, startedAt)).toBe(false);
    expect(getWorkflowRun(db, id)?.status).toBe("running");
  });

  test("does not start a run cancelled before it is claimed", () => {
    const db = setup();
    const id = createWorkflowRun(db, "manual", "custom");

    expect(cancelPendingWorkflow(db, id)).toBe("cancelled");
    expect(claimWorkflowRun(db, id, new Date().toISOString())).toBe(false);
    expect(getWorkflowRun(db, id)?.status).toBe("cancelled");
  });


  test("marks unfinished runs as interrupted with an explanatory error", () => {
    const db = setup();
    const id = createWorkflowRun(db, "manual", "custom");

    markInterruptedWorkflows(db);

    const run = getWorkflowRun(db, id);
    expect(run?.status).toBe("failed");
    expect(run?.stage).toBe("interrupted");
    expect(run?.error).toContain("工作流完成前退出");
  });

  test("cannot cancel a run after it has started", () => {
    const db = setup();
    const id = createWorkflowRun(db, "manual", "custom");

    expect(claimWorkflowRun(db, id, new Date().toISOString())).toBe(true);
    expect(cancelPendingWorkflow(db, id)).toBe("not-pending");
    expect(getWorkflowRun(db, id)?.status).toBe("running");
  });
});
