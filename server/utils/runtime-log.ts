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
  return enabled ? `${color}${value}${ANSI.reset}` : value;
}

/**
 * 统一开发与生产环境的日志格式。
 * 使用低饱和度 256 色配色：雾蓝标识项目、柔和琥珀提示警告、灰玫瑰突出错误。
 * 普通日志正文保持终端默认颜色，避免整行高亮造成视觉噪声。
 * 默认在交互式终端启用颜色；Docker 等非 TTY 环境可通过 FORCE_COLOR=1 开启。
 */
export function runtimeLog(
  level: RuntimeLogLevel,
  message: string,
  ...details: unknown[]
): void {
  const colored = supportsColor();
  const prefix = colorize("[genpac-runner]", ANSI.mutedBlue, colored);
  const messageColor =
    level === "error"
      ? ANSI.mutedRose
      : level === "warn"
        ? ANSI.mutedAmber
        : "";
  const output = colorize(message, messageColor, colored);

  console[level](`${prefix} ${output}`, ...details);
}
