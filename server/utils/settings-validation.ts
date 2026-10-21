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

  for (const key of ["webhookSuccessConfig", "webhookFailureConfig"] as const) {
    const value = body[key];
    if (value === undefined) continue;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return key + " must be an object";
    }

    const config = value as Record<string, unknown>;
    for (const field of [
      "url",
      "headers",
      "body",
      "dingTalkSecret",
      "testBody",
      "messageTemplate",
      "testMessageTemplate",
    ] as const) {
      if (config[field] !== undefined && typeof config[field] !== "string") {
        return key + "." + field + " must be a string";
      }
    }
    if (
      config.provider !== undefined &&
      config.provider !== "custom" &&
      config.provider !== "dingtalk"
    ) {
      return key + ".provider is unsupported";
    }
    if (
      config.method !== undefined &&
      config.method !== "POST" &&
      config.method !== "PUT" &&
      config.method !== "PATCH"
    ) {
      return key + ".method is unsupported";
    }
    if (
      config.dingTalkMessageType !== undefined &&
      config.dingTalkMessageType !== "text" &&
      config.dingTalkMessageType !== "markdown"
    ) {
      return key + ".dingTalkMessageType is unsupported";
    }
  }

  return null;
}
