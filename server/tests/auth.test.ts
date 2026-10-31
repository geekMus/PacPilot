import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request } from "express";
import {
  LOGIN_FAILURE_MAX_KEYS,
  checkLoginRateLimit,
  clearLoginFailures,
  getLoginFailureKeyCount,
  recordLoginFailure,
} from "../middleware/auth";
import { configureClientIp } from "../utils/client-ip";

const WINDOW_MS = 15 * 60 * 1000;

function requestFrom(forwardedIp: string): Request {
  // 直连对端固定为内网地址（Docker 场景），这样 X-Forwarded-For 会被采信，
  // clientKey 落在被伪造的来源 IP 上，正是限流表要防的高基数键。
  return {
    headers: { "x-forwarded-for": forwardedIp },
    socket: { remoteAddress: "10.0.0.1" },
  } as unknown as Request;
}

/** Distinct valid addresses for filling the table in the cap test. */
function spoofedAddress(index: number): string {
  return `203.0.${Math.floor(index / 250) % 256}.${(index % 250) + 1}`;
}

beforeEach(() => {
  configureClientIp({ trustProxyHops: 1, trustCloudflare: false, trustedProxyCidrs: [] });
});

describe("login throttle", () => {
  it("throttles after the failure cap and resets when the key is cleared", () => {
    const req = requestFrom("203.0.113.10");
    for (let i = 0; i < 8; i += 1) recordLoginFailure(req);

    expect(checkLoginRateLimit(req)).not.toBeNull();

    clearLoginFailures(req);
    expect(checkLoginRateLimit(req)).toBeNull();
  });

  it("forgets failures once they fall outside the sliding window", () => {
    let now = 1_700_000_000_000;
    const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
    const req = requestFrom("203.0.113.11");
    for (let i = 0; i < 8; i += 1) {
      now += 1000;
      recordLoginFailure(req);
    }

    expect(checkLoginRateLimit(req)).not.toBeNull();

    now += WINDOW_MS + 1;
    expect(checkLoginRateLimit(req)).toBeNull();
    clock.mockRestore();
  });
});

describe("login throttle table cap", () => {
  it("never tracks more keys than the configured cap", () => {
    for (let i = 0; i < LOGIN_FAILURE_MAX_KEYS + 50; i += 1) {
      recordLoginFailure(requestFrom(spoofedAddress(i)));
    }

    expect(getLoginFailureKeyCount()).toBeLessThanOrEqual(LOGIN_FAILURE_MAX_KEYS);

    // A brand-new address still gets its own window and can be throttled.
    const fresh = requestFrom("203.0.199.77");
    for (let i = 0; i < 8; i += 1) recordLoginFailure(fresh);
    expect(checkLoginRateLimit(fresh)).not.toBeNull();
  });

  it("sweeps expired keys so the table drains after a spoofing burst ends", () => {
    let now = 1_800_000_000_000;
    const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
    for (let i = 0; i < LOGIN_FAILURE_MAX_KEYS + 50; i += 1) {
      recordLoginFailure(requestFrom(spoofedAddress(i)));
    }
    expect(getLoginFailureKeyCount()).toBeLessThanOrEqual(LOGIN_FAILURE_MAX_KEYS);

    now += WINDOW_MS + 1;
    recordLoginFailure(requestFrom("203.0.199.78"));

    expect(getLoginFailureKeyCount()).toBeLessThanOrEqual(2);
    clock.mockRestore();
  });
});
