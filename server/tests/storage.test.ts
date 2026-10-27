import { describe, expect, it } from "vitest";
import { createMemoryApplicationStorage } from "../storage/memory/application-storage";

describe("memory storage adapter", () => {
  it("keeps application repositories isolated and clears volatile state on close", async () => {
    const storage = createMemoryApplicationStorage();
    expect(storage.driver).toBe("memory");

    await storage.settings.update({ timezone: "UTC" });
    await storage.credentials.set({ passwordHash: "hash", salt: "salt", sessionSecret: "secret" });
    await storage.monitoring.record({
      created_at: new Date().toISOString(),
      method: "GET",
      path: "/proxy.pac",
      category: "pac",
      source_ip: "127.0.0.1",
      user_agent: "test",
      status_code: 200,
      duration_ms: 3,
      response_bytes: 10,
      query_string: "",
      host: "localhost",
      referer: "",
      accept: "*/*",
      accept_language: "en",
      content_type: "",
      request_headers: "{}",
      response_content_type: "text/plain",
    });
    const workflowId = await storage.workflows.create("manual", "custom");
    await storage.artifacts.write("proxy.pac", "PAC");

    expect((await storage.settings.get()).timezone).toBe("UTC");
    expect((await storage.credentials.get())?.sessionSecret).toBe("secret");
    expect(await storage.monitoring.count()).toBe(1);
    expect((await storage.workflows.get(workflowId))?.status).toBe("pending");
    expect(new TextDecoder().decode(await storage.artifacts.read("proxy.pac"))).toBe("PAC");
    expect(await storage.maintenance.databaseBytes()).toBe(0);

    await storage.close();
    expect((await storage.settings.get()).timezone).toBe("Asia/Shanghai");
    expect(await storage.credentials.get()).toBeNull();
    expect(await storage.monitoring.count()).toBe(0);
    expect(await storage.workflows.count()).toBe(0);
    expect(await storage.artifacts.exists("proxy.pac")).toBe(false);
  });

  it("uses the same normalized default settings as the SQLite adapter contract", async () => {
    const first = createMemoryApplicationStorage();
    const second = createMemoryApplicationStorage();
    expect(await first.settings.get()).toEqual(await second.settings.get());

    await first.settings.update({ timezone: "UTC" });
    expect((await first.settings.get()).timezone).toBe("UTC");
    expect((await second.settings.get()).timezone).toBe("Asia/Shanghai");

    await first.close();
    await second.close();
  });
  it("keeps workflow stages attached to existing runs", async () => {
    const storage = createMemoryApplicationStorage();
    await expect(storage.workflows.startStage(999, "prepare")).rejects.toThrow(
      /unknown workflow run/
    );

    const workflowId = await storage.workflows.create("manual", "custom");
    expect(await storage.workflows.claim(workflowId, new Date().toISOString())).toBe(true);

    const stageId = await storage.workflows.startStage(workflowId, "prepare", "{}");
    await storage.workflows.finishStage(stageId, "succeeded");
    expect(await storage.workflows.stages(workflowId)).toMatchObject([
      { run_id: workflowId, stage_key: "prepare", status: "succeeded" },
    ]);

    await storage.workflows.update(workflowId, {
      status: "succeeded",
      stage: "complete",
      finished_at: new Date().toISOString(),
    });
    expect(await storage.workflows.get(workflowId)).toMatchObject({ status: "succeeded" });
    await storage.close();
  });
  it("exposes Promise-based operations and allows only one concurrent workflow claim", async () => {
    const storage = createMemoryApplicationStorage();
    const settingsPromise = storage.settings.get();
    expect(settingsPromise).toBeInstanceOf(Promise);
    await settingsPromise;

    const workflowId = await storage.workflows.create("manual", "custom");
    const claims = await Promise.all([
      storage.workflows.claim(workflowId, "2026-10-23T10:00:00.000Z"),
      storage.workflows.claim(workflowId, "2026-10-23T10:00:01.000Z"),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    await storage.close();
  });
});
