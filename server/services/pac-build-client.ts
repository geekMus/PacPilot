/**
 * PAC 构建子进程客户端。
 *
 * 压缩与混淆交给独立子进程执行（见 `server/workers/pac-build-worker.ts`）：
 * 主线程在生成期间不会被 CPU 密集任务卡住，子进程退出后内存全部归还操作系统。
 *
 * 协议：stdin 收一整段 JSON 请求，stdout 回一整段 JSON 响应。
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { AppLocale } from "../../shared/i18n/locale";

export interface PacBuildRequest {
  /** 待构建的 PAC 源码（未压缩、未混淆）。 */
  code: string;
  /** 是否先用 terser 压缩。 */
  compress: boolean;
  /** 是否在压缩之后做混淆。 */
  obfuscate: boolean;
  /** 报错文案使用的语言。 */
  locale: AppLocale;
}

export interface PacBuildOptions {
  /** 覆盖构建子进程脚本路径（测试用）。 */
  workerPath?: string;
  /** 覆盖子进程使用的运行时可执行文件（测试用）。 */
  runtimePath?: string;
  /** 子进程超时上限（毫秒）。 */
  timeoutMs?: number;
}

/** 构建子进程脚本的绝对路径。 */
export const PAC_BUILD_WORKER_PATH = fileURLToPath(
  new URL("../workers/pac-build-worker.ts", import.meta.url)
);

/** 单次构建的默认超时上限：12000 条规则实测 1.5s 内完成，留足余量。 */
export const PAC_BUILD_TIMEOUT_MS = 120_000;

interface PacBuildResponse {
  ok?: boolean;
  code?: string;
  error?: string;
}

/**
 * 解析子进程使用的运行时。
 *
 * 子进程需要 Bun 的 stdin/stdout API（Bun.stdin.text / Bun.write），因此这里始终用
 * bun 启动：与当前运行时一致时直接复用 process.execPath，否则退回到 PATH 上的 bun
 * （可用 PAC_BUILD_BUN 环境变量覆盖）。
 */
function resolveRuntimeExecutable(): string {
  if (process.versions.bun) return process.execPath;
  return process.env.PAC_BUILD_BUN || "bun";
}

/**
 * 在子进程里完成「压缩 → 混淆」，返回最终 PAC 代码。
 *
 * 任何失败都以异常形式抛出：子进程无法启动、超时、返回结构不合法，
 * 或者子进程报告构建失败（含 terser / 混淆器的原始报错文案）。
 */
export async function buildPacBody(
  request: PacBuildRequest,
  options: PacBuildOptions = {}
): Promise<string> {
  const workerPath = options.workerPath ?? PAC_BUILD_WORKER_PATH;
  const runtimePath = options.runtimePath ?? resolveRuntimeExecutable();
  const timeoutMs = options.timeoutMs ?? PAC_BUILD_TIMEOUT_MS;

  return await new Promise<string>((resolve, reject) => {
    const child = spawn(runtimePath, ["run", "--no-env-file", workerPath], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let settled = false;

    const timer = setTimeout(() => {
      finish(new Error(`PAC 构建子进程超时（${timeoutMs}ms）。`));
      child.kill("SIGKILL");
    }, timeoutMs);
    timer.unref?.();

    function finish(error: Error | null, code?: string): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(code as string);
    }

    child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));
    // 子进程提前退出时向 stdin 写入会触发 EPIPE，这里忽略即可，真正的错误由 close 处理器给出。
    child.stdin.on("error", () => undefined);

    child.on("error", (error: Error) => {
      finish(new Error(`无法启动 PAC 构建子进程：${error.message}`));
    });

    child.on("close", (exitCode) => {
      const raw = Buffer.concat(stdoutChunks).toString("utf8").trim();
      if (!raw) {
        const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();
        finish(
          new Error(
            `PAC 构建子进程没有返回结果（退出码 ${exitCode}）${stderr ? `：${stderr}` : ""}。`
          )
        );
        return;
      }
      let parsed: PacBuildResponse;
      try {
        parsed = JSON.parse(raw) as PacBuildResponse;
      } catch {
        finish(new Error("PAC 构建子进程返回了无法解析的结果。"));
        return;
      }
      if (!parsed.ok) {
        finish(new Error(parsed.error || "PAC 构建失败。"));
        return;
      }
      if (typeof parsed.code !== "string") {
        finish(new Error("PAC 构建子进程没有返回产物。"));
        return;
      }
      finish(null, parsed.code);
    });

    child.stdin.end(JSON.stringify(request));
  });
}
