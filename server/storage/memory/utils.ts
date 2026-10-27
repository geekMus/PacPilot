export function clone<T>(value: T): T {
  return structuredClone(value);
}

export function safeLimit(value: number | undefined, fallback: number, max = 101): number {
  return Math.max(1, Math.min(max, Math.floor(Number(value) || fallback)));
}
