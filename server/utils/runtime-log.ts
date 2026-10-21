import { formatWithOptions } from "node:util";

type RuntimeLogLevel = "log" | "info" | "warn" | "error";

const ANSI = {
  reset: "\u001b[0m",
  mutedBlue: "\u001b[38;5;110m",
  mutedAmber: "\u001b[38;5;179m",
  mutedRose: "\u001b[38;5;167m",
} as const;

function supportsColor(): boolean {
  if (process.env.NO_COLOR !== undefined || process.env.FORCE_COLOR === "0") {
    return false;
  }

  return (
    process.env.FORCE_COLOR !== undefined ||
    Boolean(process.stdout.isTTY) ||
    Boolean(process.stderr.isTTY)
  );
}

function colorize(value: string, color: string, enabled: boolean): string {
  return enabled && color ? `${color}${value}${ANSI.reset}` : value;
}

function getTimestamp(): string {
  const now = new Date();
  const configuredTimeZone =
    process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone;

  try {
    const timestamp = new Intl.DateTimeFormat("sv-SE", {
      timeZone: configuredTimeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).format(now);

    return `${timestamp} ${configuredTimeZone}`;
  } catch {
    // 无效的 TZ 配置不应导致业务日志本身丢失；退回运行时默认时区。
    const timestamp = new Intl.DateTimeFormat("sv-SE", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).format(now);

    return `${timestamp} ${Intl.DateTimeFormat().resolvedOptions().timeZone}`;
  }
}

/**
 * 统一开发与生产环境的日志格式。
 * 时间使用系统本地时区；Docker 中可通过 TZ 指定时区。
 * 多行内容的续行与正文起始位置对齐，避免堆栈或提示信息破坏日志层级。
 */
export function runtimeLog(
  level: RuntimeLogLevel,
  message: string,
  ...details: unknown[]
): void {
  const colored = supportsColor();
  const plainPrefix = `[${getTimestamp()}] [genpac-runner]`;
  const prefix = colorize(plainPrefix, ANSI.mutedBlue, colored);
  const messageColor =
    level === "error"
      ? ANSI.mutedRose
      : level === "warn"
        ? ANSI.mutedAmber
        : "";

  const formatted = formatWithOptions({ colors: false, depth: 5 }, message, ...details);
  const lines = formatted.split(/\r?\n/);
  const indent = " ".repeat(plainPrefix.length + 1);
  const output = lines
    .map((line, index) => {
      const body = index === 0 ? line : `${indent}${line}`;
      return index === 0
        ? `${prefix} ${colorize(body, messageColor, colored)}`
        : body;
    })
    .join("\n");

  console[level](output);
}
