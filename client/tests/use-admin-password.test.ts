import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import { mount } from "@vue/test-utils";

const api = vi.hoisted(() => ({ changePassword: vi.fn() }));
const sessionToken = vi.hoisted(() => ({ clearSessionToken: vi.fn() }));
const adminSession = vi.hoisted(() => ({ invalidateAdminSessionCache: vi.fn() }));
const toast = vi.hoisted(() => ({ notify: vi.fn() }));
const router = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("@/api/client", () => {
  class ApiError extends Error {
    constructor(
      message: string,
      readonly code = ""
    ) {
      super(message);
      this.name = "ApiError";
    }
  }
  return { api, ApiError };
});
vi.mock("@/api/session-token", () => sessionToken);
vi.mock("@/composables/useAdminSession", () => adminSession);
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ notify: toast.notify }) }));
vi.mock("vue-router", () => ({ useRouter: () => router }));
vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));

type PasswordApi = Awaited<
  ReturnType<(typeof import("../src/composables/useAdminPassword"))["useAdminPassword"]>
>;

async function setup(): Promise<PasswordApi> {
  vi.resetModules();
  const { useAdminPassword } = await import("../src/composables/useAdminPassword");
  let result: PasswordApi | null = null;
  const wrapper = mount(
    defineComponent({
      setup() {
        result = useAdminPassword();
        return () => null;
      },
    })
  );
  const api = result as unknown as PasswordApi;
  (api as unknown as { _wrapper?: unknown })._wrapper = wrapper;
  return api;
}

function fill(password: PasswordApi, values: Partial<Record<string, string>>): void {
  Object.assign(password.passwordForm, values);
}

beforeEach(() => {
  api.changePassword.mockReset();
  api.changePassword.mockResolvedValue({ ok: true });
  sessionToken.clearSessionToken.mockReset();
  adminSession.invalidateAdminSessionCache.mockReset();
  toast.notify.mockReset();
  router.replace.mockReset();
  router.replace.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("client-side validation", () => {
  it("requires the current password", async () => {
    const password = await setup();
    fill(password, { currentPassword: "", newPassword: "new-pass", confirmPassword: "new-pass" });

    await password.changeAdminPassword();

    expect(password.passwordError.value).toBe("settings.enterCurrentPassword");
    expect(api.changePassword).not.toHaveBeenCalled();
  });

  it("requires matching passwords", async () => {
    const password = await setup();
    fill(password, { currentPassword: "old", newPassword: "new-pass", confirmPassword: "other" });

    await password.changeAdminPassword();

    expect(password.passwordError.value).toBe("settings.passwordMismatch");
    expect(api.changePassword).not.toHaveBeenCalled();
  });

  it("rejects reusing the current password", async () => {
    const password = await setup();
    fill(password, { currentPassword: "same", newPassword: "same", confirmPassword: "same" });

    await password.changeAdminPassword();

    expect(password.passwordError.value).toBe("settings.passwordSameAsCurrent");
    expect(api.changePassword).not.toHaveBeenCalled();
  });

  it("clears a previous error before validating again", async () => {
    const password = await setup();
    password.passwordError.value = "leftover";
    fill(password, { currentPassword: "", newPassword: "", confirmPassword: "" });

    await password.changeAdminPassword();

    expect(password.passwordError.value).toBe("settings.enterCurrentPassword");
    expect(password.passwordError.value).not.toBe("leftover");
  });
});

describe("successful change", () => {
  it("clears the token, refreshes the cache and redirects", async () => {
    const password = await setup();
    fill(password, {
      currentPassword: "old",
      newPassword: "new-pass",
      confirmPassword: "new-pass",
    });

    await password.changeAdminPassword();

    expect(api.changePassword).toHaveBeenCalledWith({
      currentPassword: "old",
      newPassword: "new-pass",
    });
    expect(sessionToken.clearSessionToken).toHaveBeenCalledTimes(1);
    expect(adminSession.invalidateAdminSessionCache).toHaveBeenCalledTimes(1);
    expect(toast.notify).toHaveBeenCalledWith("settings.passwordChangedOk", "success");
    expect(router.replace).toHaveBeenCalledWith({
      path: "/admin/login",
      query: { passwordChanged: "1" },
    });
    expect(password.passwordSaving.value).toBe(false);
  });
});

describe("server-side failures", () => {
  it("maps the ApiError code to an i18n key", async () => {
    const { ApiError } = await import("@/api/client");
    api.changePassword.mockRejectedValue(
      new ApiError("当前管理密码不正确。", "current_password_incorrect")
    );
    const password = await setup();
    fill(password, {
      currentPassword: "old",
      newPassword: "new-pass",
      confirmPassword: "new-pass",
    });

    await password.changeAdminPassword();

    expect(password.passwordError.value).toBe("settings.currentPasswordIncorrect");
    expect(sessionToken.clearSessionToken).not.toHaveBeenCalled();
  });

  it("maps every documented error code", async () => {
    const { ApiError } = await import("@/api/client");
    const cases: Array<[string, string]> = [
      ["new_password_empty", "settings.newPasswordEmpty"],
      ["new_password_same_as_current", "settings.passwordSameAsCurrent"],
    ];

    for (const [code, key] of cases) {
      api.changePassword.mockRejectedValue(new ApiError("boom", code));
      const password = await setup();
      fill(password, {
        currentPassword: "old",
        newPassword: "new-pass",
        confirmPassword: "new-pass",
      });

      await password.changeAdminPassword();

      expect(password.passwordError.value).toBe(key);
    }
  });

  it("falls back to the Chinese message when the code is unknown", async () => {
    const { ApiError } = await import("@/api/client");
    api.changePassword.mockRejectedValue(new ApiError("新密码不能为空。", "something_else"));
    const password = await setup();
    fill(password, {
      currentPassword: "old",
      newPassword: "new-pass",
      confirmPassword: "new-pass",
    });

    await password.changeAdminPassword();

    expect(password.passwordError.value).toBe("settings.newPasswordEmpty");
  });

  it("shows a plain Error message when nothing matches", async () => {
    api.changePassword.mockRejectedValue(new Error("socket closed"));
    const password = await setup();
    fill(password, {
      currentPassword: "old",
      newPassword: "new-pass",
      confirmPassword: "new-pass",
    });

    await password.changeAdminPassword();

    expect(password.passwordError.value).toBe("socket closed");
    expect(password.passwordSaving.value).toBe(false);
  });

  it("uses the translated fallback when the error has no message", async () => {
    api.changePassword.mockRejectedValue("not an error");
    const password = await setup();
    fill(password, {
      currentPassword: "old",
      newPassword: "new-pass",
      confirmPassword: "new-pass",
    });

    await password.changeAdminPassword();

    expect(password.passwordError.value).toBe("settings.passwordChangeFailed");
  });
});
