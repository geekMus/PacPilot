export function normalizeOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin === "null" ? null : url.origin;
  } catch {
    return null;
  }
}

export function isTrustedOrigin(
  origin: string | undefined,
  requestOrigin: string,
  allowedOrigins: ReadonlySet<string>
): boolean {
  const normalizedOrigin = normalizeOrigin(origin);
  const normalizedRequestOrigin = normalizeOrigin(requestOrigin);
  return Boolean(
    normalizedOrigin &&
      ((normalizedRequestOrigin && normalizedOrigin === normalizedRequestOrigin) ||
        allowedOrigins.has(normalizedOrigin))
  );
}
