import path from "node:path";
import { loadDevelopmentDotEnv } from "../server/config/load-dotenv";
import { runtimeLog } from "../server/utils/runtime-log";

/**
 * Start the backend and wait until its API is available before starting Vite.
 * Forward Vite output unchanged so its native formatting and colors are preserved.
 */
process.env.NODE_ENV = "development";
process.env.GENPAC_ENV = "development";
loadDevelopmentDotEnv();

const env: Record<string, string | undefined> = {
  ...process.env,
  NODE_ENV: "development",
  GENPAC_ENV: "development",
  DATA_DIR: process.env.DATA_DIR || "./data",
  PORT: process.env.PORT || "17321",
  HOST: process.env.HOST || "0.0.0.0",
};

const apiPort = env.PORT || "17321";
const apiHealthUrl = `http://127.0.0.1:${apiPort}/api/meta`;
const server = Bun.spawn([process.execPath, "--hot", "server/index.ts"], {
  stdout: "inherit",
  stderr: "inherit",
  stdin: "inherit",
  env,
});

let shuttingDown = false;
let client: ReturnType<typeof Bun.spawn> | undefined;

const shutdown = () => {
  if (shuttingDown) return;
  shuttingDown = true;
  server.kill();
  client?.kill();
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

async function waitForBackend(): Promise<boolean> {
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    if (server.exitCode !== null) return false;

    try {
      const response = await fetch(apiHealthUrl, {
        signal: AbortSignal.timeout(500),
      });
      if (response.ok) return true;
    } catch {
      // The backend may need time to initialize and bind its port.
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return false;
}

const backendReady = await Promise.race([
  waitForBackend().then((ready) => ({ type: "ready" as const, ready })),
  server.exited.then((code) => ({ type: "exit" as const, code })),
]);

if (backendReady.type === "exit" || !backendReady.ready) {
  if (backendReady.type === "exit") {
    runtimeLog("error", `Backend exited before becoming ready (exit code: ${backendReady.code}).`);
    process.exitCode = backendReady.code || 1;
  } else {
    runtimeLog("error", `Timed out waiting for backend at ${apiHealthUrl}. Check the backend errors above.`);
    shutdown();
    await server.exited;
    process.exit(1);
  }
  shutdown();
  await server.exited;
  process.exit();
}

// Launch the installed Vite CLI directly to avoid bunx wrapper-process issues on Windows/Git Bash.
const viteCli = path.resolve("node_modules/vite/bin/vite.js");
client = Bun.spawn(
  [
    process.execPath,
    viteCli,
    "--config",
    "client/vite.config.ts",
    "--clearScreen",
    "false",
  ],
  {
    stdout: "pipe",
    stderr: "pipe",
    stdin: "inherit",
    env: { ...env, FORCE_COLOR: env.FORCE_COLOR || "1" },
  },
);

let resolveViteReady!: () => void;
const viteReady = new Promise<void>((resolve) => {
  resolveViteReady = resolve;
});
let hasViteReady = false;

async function forwardViteOutput(
  stream: ReadableStream<Uint8Array> | null,
  target: "stdout" | "stderr",
): Promise<void> {
  if (!stream) return;

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let pending = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      if (target === "stderr") process.stderr.write(value);
      else process.stdout.write(value);

      if (!hasViteReady && target === "stdout") {
        pending += decoder.decode(value, { stream: true });
        const plainPending = pending.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");
        if (/ready in\s+\d+\s*ms/i.test(plainPending)) {
          hasViteReady = true;
          resolveViteReady();
        } else if (pending.length > 2000) {
          pending = pending.slice(-500);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

const viteStdout = forwardViteOutput(client.stdout, "stdout");
const viteStderr = forwardViteOutput(client.stderr, "stderr");

const viteStartup = await Promise.race([
  viteReady.then(() => ({ ready: true as const })),
  client.exited.then((code) => ({ ready: false as const, code })),
]);

if (!viteStartup.ready) {
  await Promise.allSettled([viteStdout, viteStderr]);
  runtimeLog("error", `Vite failed to start (exit code: ${viteStartup.code}). See Vite output above.`);
  shutdown();
  process.exit(viteStartup.code ?? 1);
}

const exited = await Promise.race([
  server.exited.then((code) => ({ process: "server" as const, code })),
  client.exited.then((code) => ({ process: "client" as const, code })),
]);

shutdown();
await Promise.allSettled([viteStdout, viteStderr, server.exited, client.exited]);
runtimeLog(
  "warn",
  `${exited.process === "server" ? "Backend" : "Vite frontend"} process exited (exit code: ${exited.code}).`,
);
process.exit(exited.code ?? 0);
