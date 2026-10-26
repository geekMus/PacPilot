import { afterEach, describe, expect, it, vi } from "vitest";
import type { DomainEvent } from "../../shared/contracts";
import { createDefaultWebhookConfig } from "../domain/settings";
import { sendWebhook, sendWebhookForEvent, sendWebhookTest } from "../services/webhook";

type FetchArgs = [string | URL, RequestInit];

function config(overrides: Record<string, unknown> = {}) {
  return { ...createDefaultWebhookConfig(), url: "https://example.com/hook", ...overrides };
}

function stubFetch(
  impl: (url: string, init: RequestInit) => Promise<Response> | Response
): ReturnType<typeof vi.fn> {
  const mock = vi.fn(async (url: string | URL, init?: RequestInit) => {
    return impl(String(url), init ?? {});
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function lastCall(mock: ReturnType<typeof vi.fn>): FetchArgs {
  const calls = mock.mock.calls as FetchArgs[];
  return calls[calls.length - 1]!;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("sendWebhook for custom providers", () => {
  it("posts the rendered body with the configured method and headers", async () => {
    const mock = stubFetch(() => jsonResponse({ ok: true }));
    const result = await sendWebhook(
      config({ method: "PUT", headers: '{"X-Trace":"abc"}', body: '{"m":"{{message}}"}' }),
      "success"
    );

    expect(result).toEqual({ success: true, status: 200, message: "目标端点已接受请求。" });
    const [url, init] = lastCall(mock);
    expect(url).toBe("https://example.com/hook");
    expect(init.method).toBe("PUT");
    expect(init.headers).toMatchObject({ "Content-Type": "application/json", "X-Trace": "abc" });
    expect(JSON.parse(String(init.body))).toEqual({ m: "PAC 已成功生成。" });
  });

  it("falls back to the built-in body when no template is configured", async () => {
    const mock = stubFetch(() => jsonResponse({}));
    await sendWebhook(config(), "failure", "自定义失败原因");
    const body = JSON.parse(String(lastCall(mock)[1].body));
    expect(body).toMatchObject({ event: "pac.generation_failed", message: "自定义失败原因" });
  });

  it("uses the test body and test message for test deliveries", async () => {
    const mock = stubFetch(() => jsonResponse({}));
    await sendWebhookTest(config({ testBody: '{"kind":"test"}' }));
    expect(JSON.parse(String(lastCall(mock)[1].body))).toEqual({ kind: "test" });
  });

  it("falls back to the task body when only the test body is configured", async () => {
    const mock = stubFetch(() => jsonResponse({}));
    await sendWebhook(config({ body: '{"kind":"task"}', testBody: "" }), "test");
    expect(JSON.parse(String(lastCall(mock)[1].body))).toEqual({ kind: "task" });
  });

  it("escapes template values so the JSON payload stays valid", async () => {
    const mock = stubFetch(() => jsonResponse({}));
    await sendWebhook(
      config({ body: '{"m":"{{message}}"}' }),
      "failure",
      'quotes " and \\ backslash'
    );
    const body = JSON.parse(String(lastCall(mock)[1].body)) as { m: string };
    expect(body.m).toBe('quotes " and \\ backslash');
  });

  it("returns the validation errors without issuing a request", async () => {
    const mock = stubFetch(() => jsonResponse({}));
    const result = await sendWebhook(config({ url: "", body: "{oops" }), "success");
    expect(result.success).toBe(false);
    expect(result.message).toContain("Webhook URL不能为空。");
    expect(result.message).toContain("Webhook Body不是合法 JSON。");
    expect(mock).not.toHaveBeenCalled();
  });

  it("reports the provider description when the endpoint rejects the request", async () => {
    stubFetch(() => jsonResponse({ ok: false, description: "签名不匹配" }, 200));
    const result = await sendWebhook(config(), "success");
    expect(result).toEqual({ success: false, status: 200, message: "签名不匹配" });
  });

  it("reports the HTTP status when the response body is not JSON", async () => {
    stubFetch(() => new Response("not json", { status: 503 }));
    const result = await sendWebhook(config(), "success");
    expect(result).toEqual({ success: false, status: 503, message: "目标端点返回 HTTP 503。" });
  });

  it("treats a non-zero errcode as a provider rejection", async () => {
    stubFetch(() => jsonResponse({ errcode: 310000, errmsg: "invalid token" }));
    const result = await sendWebhook(config(), "success");
    expect(result).toEqual({ success: false, status: 200, message: "invalid token" });
  });

  it("treats errcode 0 as success", async () => {
    stubFetch(() => jsonResponse({ errcode: 0, errmsg: "ok" }));
    expect((await sendWebhook(config(), "success")).success).toBe(true);
  });

  it("maps an aborted request to the timeout message", async () => {
    stubFetch(() => {
      throw new Error("The operation was aborted");
    });
    expect(await sendWebhook(config(), "success")).toEqual({
      success: false,
      message: "Webhook请求超时（10 秒）。",
    });
  });

  it("maps any other transport error to a generic failure", async () => {
    stubFetch(() => {
      throw new Error("connect ECONNREFUSED");
    });
    expect(await sendWebhook(config(), "success")).toEqual({
      success: false,
      message: "Webhook请求失败：connect ECONNREFUSED",
    });
  });

  it("stringifies non-Error throws", async () => {
    stubFetch(() => {
      throw "boom";
    });
    expect((await sendWebhook(config(), "success")).message).toBe("Webhook请求失败：boom");
  });

  it("cancels the unread response body", async () => {
    const cancel = vi.fn(async () => undefined);
    stubFetch(
      () =>
        ({
          status: 200,
          json: async () => ({}),
          body: { cancel },
        }) as unknown as Response
    );
    await sendWebhook(config(), "success");
    expect(cancel).toHaveBeenCalled();
  });
});

describe("sendWebhook for DingTalk robots", () => {
  const dingTalkUrl = "https://oapi.dingtalk.com/robot/send?access_token=abc";

  it("signs the URL and posts a text message by default", async () => {
    const mock = stubFetch(() => jsonResponse({ errcode: 0 }));
    const result = await sendWebhook(
      config({ provider: "dingtalk", url: dingTalkUrl, dingTalkSecret: "SECtest" }),
      "success"
    );

    expect(result.success).toBe(true);
    const [url, init] = lastCall(mock);
    const parsed = new URL(String(url));
    expect(parsed.searchParams.get("access_token")).toBe("abc");
    expect(parsed.searchParams.get("timestamp")).toBeTruthy();
    expect(parsed.searchParams.get("sign")).toBeTruthy();
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toMatchObject({ msgtype: "text" });
  });

  it("sends markdown with a title taken from the first non-empty line", async () => {
    const mock = stubFetch(() => jsonResponse({ errcode: 0 }));
    await sendWebhook(
      config({
        provider: "dingtalk",
        url: dingTalkUrl,
        dingTalkSecret: "SECtest",
        dingTalkMessageType: "markdown",
        messageTemplate: "\n  PAC 生成通知  \n{{message}}",
      }),
      "success"
    );

    const payload = JSON.parse(String(lastCall(mock)[1].body)) as {
      msgtype: string;
      markdown: { title: string; text: string };
    };
    expect(payload.msgtype).toBe("markdown");
    expect(payload.markdown.title).toBe("PAC 生成通知");
    expect(payload.markdown.text).toContain("PAC 生成通知");
  });

  it("falls back to the event name when the template renders no title", async () => {
    const mock = stubFetch(() => jsonResponse({ errcode: 0 }));
    await sendWebhook(
      config({
        provider: "dingtalk",
        url: dingTalkUrl,
        dingTalkSecret: "SECtest",
        dingTalkMessageType: "markdown",
        messageTemplate: "   ",
      }),
      "success"
    );
    const payload = JSON.parse(String(lastCall(mock)[1].body)) as {
      markdown: { title: string };
    };
    expect(payload.markdown.title.length).toBeGreaterThan(0);
  });

  it("truncates an over-long markdown title to 64 characters", async () => {
    const mock = stubFetch(() => jsonResponse({ errcode: 0 }));
    await sendWebhook(
      config({
        provider: "dingtalk",
        url: dingTalkUrl,
        dingTalkSecret: "SECtest",
        dingTalkMessageType: "markdown",
        messageTemplate: "x".repeat(200),
      }),
      "success"
    );
    const payload = JSON.parse(String(lastCall(mock)[1].body)) as {
      markdown: { title: string };
    };
    expect(payload.markdown.title).toHaveLength(64);
  });

  it("uses the test template for test deliveries", async () => {
    const mock = stubFetch(() => jsonResponse({ errcode: 0 }));
    await sendWebhookTest(
      config({
        provider: "dingtalk",
        url: dingTalkUrl,
        dingTalkSecret: "SECtest",
        testMessageTemplate: "PacPilot test",
        messageTemplate: "{{message}}",
      })
    );
    const payload = JSON.parse(String(lastCall(mock)[1].body)) as { text: { content: string } };
    expect(payload.text.content).toBe("PacPilot test");
  });

  it("posts an unsigned robot request without timestamp or sign", async () => {
    const mock = stubFetch(() => jsonResponse({ errcode: 0 }));
    const result = await sendWebhook(
      config({ provider: "dingtalk", url: dingTalkUrl, dingTalkSecret: "" }),
      "success"
    );
    expect(result.success).toBe(true);
    const parsed = new URL(String(lastCall(mock)[0]));
    expect(parsed.searchParams.get("access_token")).toBe("abc");
    expect(parsed.searchParams.has("timestamp")).toBe(false);
    expect(parsed.searchParams.has("sign")).toBe(false);
  });

  it("reports a Bun-style timeout when the message only carries the host name", async () => {
    // Bun 的 AbortSignal.timeout 抛出的错误类型名是 TimeoutError，
    // message 形如 "request to https://example.com/hook failed"，不含 timeout 字样。
    stubFetch(() => {
      throw Object.assign(new Error("request to https://example.com/hook failed"), {
        name: "TimeoutError",
        code: "UND_ERR_CONNECT_TIMEOUT",
      });
    });
    expect(await sendWebhook(config(), "success")).toEqual({
      success: false,
      message: "Webhook请求超时（10 秒）。",
    });
  });

  it("maps a DingTalk transport failure to the 钉钉 label", async () => {
    stubFetch(() => {
      throw new Error("socket hang up");
    });
    expect(
      await sendWebhook(
        config({ provider: "dingtalk", url: dingTalkUrl, dingTalkSecret: "SECtest" }),
        "success"
      )
    ).toEqual({ success: false, message: "钉钉请求失败：socket hang up" });
  });
});

describe("sendWebhookForEvent", () => {
  function event(overrides: Partial<DomainEvent> = {}): DomainEvent {
    return {
      id: "e1",
      type: "task.execution",
      phase: "finished",
      outcome: "success",
      subject: { type: "task", id: "1", name: "PAC 生成任务" },
      occurredAt: "2026-10-25T01:00:00.000Z",
      correlationId: "workflow-1",
      summary: "生成成功",
      ...overrides,
    };
  }

  it("derives the template values from the domain event", async () => {
    const mock = stubFetch(() => jsonResponse({ ok: true }));
    await sendWebhookForEvent(
      config({ body: '{"e":"{{event}}","s":"{{status}}","m":"{{message}}","o":"{{ok}}"}' }),
      event()
    );
    expect(JSON.parse(String(lastCall(mock)[1].body))).toEqual({
      e: "task.execution.finished",
      s: "success",
      m: "生成成功",
      o: "true",
    });
  });

  it("leaves ok empty when the outcome is unknown", async () => {
    const mock = stubFetch(() => jsonResponse({ ok: true }));
    await sendWebhookForEvent(
      config({ body: '{"o":"{{ok}}","s":"{{status}}"}' }),
      event({ outcome: undefined })
    );
    expect(JSON.parse(String(lastCall(mock)[1].body))).toEqual({ o: "", s: "unknown" });
  });

  it("reports started for a started phase without an outcome", async () => {
    const mock = stubFetch(() => jsonResponse({ ok: true }));
    await sendWebhookForEvent(
      config({ body: '{"s":"{{status}}"}' }),
      event({ phase: "started", outcome: undefined })
    );
    expect(JSON.parse(String(lastCall(mock)[1].body))).toEqual({ s: "started" });
  });

  it("falls back to the type and phase when there is no summary", async () => {
    const mock = stubFetch(() => jsonResponse({ ok: true }));
    await sendWebhookForEvent(
      config({ body: '{"m":"{{message}}"}' }),
      event({ summary: undefined })
    );
    expect(JSON.parse(String(lastCall(mock)[1].body))).toEqual({ m: "task.execution finished" });
  });

  it("routes DingTalk events through the signed sender", async () => {
    const mock = stubFetch(() => jsonResponse({ errcode: 0 }));
    await sendWebhookForEvent(
      config({
        provider: "dingtalk",
        url: "https://oapi.dingtalk.com/robot/send?access_token=abc",
        dingTalkSecret: "SECtest",
      }),
      event()
    );
    const url = new URL(String(lastCall(mock)[0]));
    expect(url.searchParams.get("sign")).toBeTruthy();
  });
});
