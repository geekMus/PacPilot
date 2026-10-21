type RuntimeLogLevel = "log" | "info" | "warn" | "error";

const ANSI = {
  reset: "\u001b[0m",
  cyan: "\u001b[36m",
  yellow: "\u001b[33m",
  red: "\u001b[31m",
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
  return enabled ? `${color}${value}${ANSI.reset}` : value;
}

/**
 * 统一开发与生产环境的日志格式。
 * 默认在交互式终端使用颜色；Docker 等非 TTY 环境可通过 FORCE_COLOR=1 开启。
 */
export function runtimeLog(
  level: RuntimeLogLevel,
  message: string,
  ...details: unknown[]
): void {
  const colored = supportsColor();
  const prefix = colorize("[genpac-runner]", ANSI.cyan, colored);
  const messageColor =
    level === "error" ? ANSI.red : level === "warn" ? ANSI.yellow : "";
  const output =
    messageColor.length > 0
      ? colorize(message, messageColor, colored)
      : message;

  console[level](`${prefix} ${output}`, ...details);
}
