import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import {
  createDatabase,
  getSettings,
  listWorkflowStages,
  operationalLogStorageBytes,
  recentLogs,
  setSettings,
} from "../server/db/sqlite";
import { normalizeWebhookConfig } from "../server/db/settings";
import { recordProxyProbe, listProxyProbeRuns } from "../server/db/monitoring";
import { createApp } from "../server/app";
import { COOKIE_NAME, createSessionToken } from "../server/middleware/auth";
import {
  changeAdminPassword,
  ensureAdminAuth,
  getAdminSessionSecret,
} from "../server/services/admin-credentials";
import { runPacWorkflow } from "../server/services/workflow";
import en_US from "../shared/i18n/en_US";
import zh_CN from "../shared/i18n/zh_CN";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function flattenCatalog(
  catalog: Record<string, unknown>,
  prefix = "",
  result = new Map<string, string>()
): Map<string, string> {
  for (const [key, value] of Object.entries(catalog)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") result.set(fullKey, value);
    else if (value && typeof value === "object" && !Array.isArray(value)) {
      flattenCatalog(value as Record<string, unknown>, fullKey, result);
    }
  }
  return result;
}

function assertLocaleParity(): void {
  const chinese = flattenCatalog(zh_CN);
  const english = flattenCatalog(en_US);
  const keys = new Set([...chinese.keys(), ...english.keys()]);
  const placeholders = (text: string) =>
    [...text.matchAll(/\{([^{}]+)\}/g)]
      .map((match) => match[1])
      .sort()
      .join(",");
  for (const key of keys) {
    const zh = chinese.get(key);
    const en = english.get(key);
    assert(zh !== undefined && en !== undefined, `Locale catalog is missing key: ${key}`);
    assert(placeholders(zh) === placeholders(en), `Locale placeholders differ for key: ${key}`);
  }
}

assertLocaleParity();

let dataDir: string | undefined;
let database: ReturnType<typeof createDatabase> | undefined;
let server: Server | undefined;

try {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "genpac-runtime-check-"));
  database = createDatabase(":memory:");
  const runtimeDataDir = dataDir;
  const runtimeDatabase = database;

  const settings = getSettings(runtimeDatabase);
  settings.locale = "en_US";
  settings.webhookSuccessConfig = normalizeWebhookConfig({}, "en_US");
  setSettings(runtimeDatabase, settings);
  assert(
    getSettings(runtimeDatabase).webhookSuccessConfig.messageTemplate.includes("notification"),
    "English webhook defaults were not loaded."
  );

  const { workflowId, generation } = await runPacWorkflow(
    runtimeDatabase,
    runtimeDataDir,
    "manual"
  );
  assert(generation.success, `PAC generation failed: ${generation.message}`);
  assert(recentLogs(runtimeDatabase).length === 1, "Generation result was not recorded.");
  assert(
    listWorkflowStages(runtimeDatabase, workflowId).length === 2,
    "Workflow stages were not recorded."
  );
  assert(
    fs
      .readFileSync(path.join(runtimeDataDir, "proxy.source.pac"), "utf8")
      .includes("// genpac-runner PAC generated at:"),
    "Localized PAC metadata was not generated."
  );

  recordProxyProbe(runtimeDatabase, {
    tested_at: new Date().toISOString(),
    proxy_label: "runtime-check",
    proxy_host: "127.0.0.1",
    proxy_port: 1,
    target_host: "example.com",
    success: false,
    tcp_ms: null,
    handshake_ms: null,
    target_ms: null,
    http_status: null,
    phase: "connect",
    error_code: "monitor.probeErrors.connectionFailed",
    error_detail: "runtime check",
  });
  assert(listProxyProbeRuns(runtimeDatabase).length === 1, "Proxy probe history was not recorded.");
  assert(
    operationalLogStorageBytes(runtimeDatabase) > 0,
    "Operational log storage metrics failed."
  );

  ensureAdminAuth(runtimeDatabase);
  changeAdminPassword(runtimeDatabase, "password", "Runtime-Check-Password-2026!");
  const token = createSessionToken(getAdminSessionSecret(runtimeDatabase));
  const app = createApp(
    { dataDir: runtimeDataDir, runtimeProfile: "development", port: 0, host: "127.0.0.1" },
    runtimeDatabase
  );
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server!.once("listening", resolve);
    server!.once("error", reject);
  });

  const address = server.address();
  assert(address && typeof address !== "string", "Runtime check server failed to bind.");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const headers = { cookie: `${COOKIE_NAME}=${token}` };
  for (const endpoint of [
    "/api/admin/workflows",
    "/api/admin/monitor/summary",
    "/api/admin/storage",
  ]) {
    const response = await fetch(baseUrl + endpoint, { headers });
    assert(response.ok, `${endpoint} returned HTTP ${response.status}.`);
    await response.json();
  }
  const invalidWorkflow = await fetch(baseUrl + "/api/admin/workflows/0", { headers });
  const invalidWorkflowBody = (await invalidWorkflow.json()) as { error?: string };
  assert(
    invalidWorkflow.status === 400 && invalidWorkflowBody.error === "Invalid workflow id.",
    "Locale-aware workflow API errors failed."
  );

  console.log(
    "Runtime smoke checks passed (fresh SQLite schema, PAC workflow, monitoring, and admin routes)."
  );
} finally {
  try {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server!.close((error) => (error ? reject(error) : resolve()));
      });
    }
  } finally {
    try {
      database?.close();
    } finally {
      if (dataDir) fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }
}
