import { formatWithOptions } from "node:util";

type RuntimeLogLevel = "log" | "info" | "warn" | "error";

const ANSI = {
  reset: "\u001b[0m",
  timestamp: "\u001b[38;5;245m",
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

const TIMESTAMP_OPTIONS: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
};

// 每行日志都新建 Intl.DateTimeFormat 是持续的小额分配热点；formatter 只与时区
// 相关，按解析出的时区键缓存，TZ 变化后自动重建。
let timestampFormatter: { timeZone: string | null; formatter: Intl.DateTimeFormat } | null = null;

function getTimestampFormatter(timeZone: string | null): Intl.DateTimeFormat {
  if (timestampFormatter?.timeZone === timeZone) {
    return timestampFormatter.formatter;
  }

  const formatter =
    timeZone === null
      ? new Intl.DateTimeFormat("sv-SE", TIMESTAMP_OPTIONS)
      : new Intl.DateTimeFormat("sv-SE", { ...TIMESTAMP_OPTIONS, timeZone });

  timestampFormatter = { timeZone, formatter };
  return formatter;
}

// 运行时默认时区在进程生命周期内不变；未配置 TZ 时缓存一次解析结果，
// 避免每行日志都为解析时区新建一个临时 formatter。
let resolvedDefaultTimeZone: string | null = null;

function getTimestamp(): string {
  try {
    const configuredTimeZone =
      process.env.TZ || (resolvedDefaultTimeZone ??= Intl.DateTimeFormat().resolvedOptions().timeZone);
    return getTimestampFormatter(configuredTimeZone).format(new Date());
  } catch {
    // 无效的 TZ 配置不应导致业务日志本身丢失；退回运行时默认时区。
    return getTimestampFormatter(null).format(new Date());
  }
}

/**
 * 统一开发与生产环境的日志格式。
 * 时间戳不显示时区名称；Docker 中可通过 TZ 指定使用哪个时区。
 * 多行正文逐行保留级别颜色，并与首行正文起始位置对齐。
 */
export function runtimeLog(level: RuntimeLogLevel, message: string, ...details: unknown[]): void {
  const colored = supportsColor();
  const timestamp = colorize(`[${getTimestamp()}]`, ANSI.timestamp, colored);
  const messageColor = level === "error" ? ANSI.mutedRose : level === "warn" ? ANSI.mutedAmber : "";

  // 先生成无 ANSI 的正文，再对每一行统一应用日志级别颜色，避免换行后颜色丢失。
  const formatted = formatWithOptions({ colors: false, depth: 5 }, message, ...details);
  const lines = formatted.split(/\r?\n/);
  const indent = " ".repeat("[YYYY-MM-DD HH:mm:ss] ".length);
  const output = lines
    .map((line, index) => {
      const body = colorize(line, messageColor, colored);
      return index === 0 ? `${timestamp} ${body}` : `${indent}${body}`;
    })
    .join("\n");

  console[level](output);
}
