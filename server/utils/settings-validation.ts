export function validateSettingsPayload(body: Record<string, unknown>): string | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return "request body must be a JSON object";
  }

  if (body.mode !== undefined && body.mode !== "custom" && body.mode !== "remote") {
    return "mode must be 'custom' or 'remote'";
  }

  for (const key of ["pacProxy", "listUrl", "cronSchedule", "timezone"] as const) {
    if (body[key] !== undefined && typeof body[key] !== "string") {
      return key + " must be a string";
    }
  }

  if (body.pacCompress !== undefined && typeof body.pacCompress !== "boolean") {
    return "pacCompress must be a boolean";
  }

  if (body.pacObfuscate !== undefined && typeof body.pacObfuscate !== "boolean") {
    return "pacObfuscate must be a boolean";
  }

  for (const key of ["blockList", "directList"] as const) {
    const value = body[key];
    if (
      value !== undefined &&
      typeof value !== "string" &&
      (!Array.isArray(value) || value.some((item) => typeof item !== "string"))
    ) {
      return key + " must be a string or an array of strings";
    }
  }

  if (
    body.logRetentionDays !== undefined &&
    (typeof body.logRetentionDays !== "number" ||
      !Number.isFinite(body.logRetentionDays) ||
      !Number.isInteger(body.logRetentionDays) ||
      body.logRetentionDays < 0 ||
      body.logRetentionDays > 3650)
  ) {
    return "logRetentionDays must be an integer between 0 and 3650";
  }

  return null;
}
