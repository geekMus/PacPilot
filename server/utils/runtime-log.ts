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

function getTimestamp(): string {
  const options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  };

  const configuredTimeZone =
    process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone;

  try {
    return new Intl.DateTimeFormat("sv-SE", {
      ...options,
      timeZone: configuredTimeZone,
    }).format(new Date());
  } catch {
    // An invalid TZ setting must not suppress application logs; fall back to the runtime time zone.
    return new Intl.DateTimeFormat("sv-SE", options).format(new Date());
  }
}

/**
 * 统一开发与生产环境的日志格式。
 * 时间戳不显示时区名称；Docker 中可通过 TZ 指定使用哪个时区。
 * 多行正文逐行保留级别颜色，并与首行正文起始位置对齐。
 */
export function runtimeLog(
  level: RuntimeLogLevel,
  message: string,
  ...details: unknown[]
): void {
  const colored = supportsColor();
  const timestamp = colorize(`[${getTimestamp()}]`, ANSI.timestamp, colored);
  const messageColor =
    level === "error"
      ? ANSI.mutedRose
      : level === "warn"
        ? ANSI.mutedAmber
        : "";

  // Format the message without ANSI codes, then apply severity colors line by line.
  const formatted = formatWithOptions(
    { colors: false, depth: 5 },
    message,
    ...details,
  );
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
