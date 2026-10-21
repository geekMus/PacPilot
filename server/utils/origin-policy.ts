export function isTrustedOrigin(
  origin: string | undefined,
  requestOrigin: string,
  allowedOrigins: ReadonlySet<string>
): boolean {
  return Boolean(origin && (origin === requestOrigin || allowedOrigins.has(origin)));
}
