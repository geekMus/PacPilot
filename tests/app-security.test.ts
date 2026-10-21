import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createApp } from "../server/app";
import { createDatabase, type AppDatabase } from "../server/db/sqlite";
import type { EnvConfig } from "../server/config/env";

describe("admin mutation origin enforcement", () => {
  let database: AppDatabase;
  let server: Server;
  let baseUrl = "";
  let originalAllowlist: string | undefined;

  beforeAll(async () => {
    originalAllowlist = process.env.CORS_ALLOWED_ORIGINS;
    process.env.CORS_ALLOWED_ORIGINS = "https://trusted.example";
    database = createDatabase(":memory:");
    const env: EnvConfig = {
      dataDir: ":memory:",
      runtimeProfile: "production",
      port: 0,
      host: "127.0.0.1",
    };
    server = createApp(env, database).listen(0, "127.0.0.1");
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      );
    }
    database?.close();
    if (originalAllowlist === undefined) delete process.env.CORS_ALLOWED_ORIGINS;
    else process.env.CORS_ALLOWED_ORIGINS = originalAllowlist;
  });

  async function login(origin?: string): Promise<Response> {
    const headers = new Headers({ "Content-Type": "application/json" });
    if (origin !== undefined) headers.set("Origin", origin);
    return fetch(`${baseUrl}/api/admin/login`, {
      method: "POST",
      headers,
      body: JSON.stringify({ password: "irrelevant-in-test" }),
    });
  }

  test("rejects mutations with a missing Origin", async () => {
    const response = await login();
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "untrusted_origin" });
  });

  test("rejects mutations from an untrusted Origin", async () => {
    const response = await login("https://evil.example");
    expect(response.status).toBe(403);
  });

  test("allows same-origin mutations through to the route handler", async () => {
    const response = await login(baseUrl);
    expect(response.status).toBe(428);
    expect(await response.json()).toEqual({ error: "setup_required" });
  });

  test("allows an explicitly configured Origin through to the route handler", async () => {
    const response = await login("https://trusted.example");
    expect(response.status).toBe(428);
    expect(await response.json()).toEqual({ error: "setup_required" });
  });
});
