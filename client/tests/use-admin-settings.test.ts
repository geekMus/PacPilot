import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import { mount } from "@vue/test-utils";
import type { AppSettings } from "../../shared/contracts";
import { DEFAULT_LIST_URL } from "../../shared/contracts";

const api = vi.hoisted(() => ({
  session: vi.fn(),
  settings: vi.fn(),
  saveSettings: vi.fn(),
  saveAndGenerate: vi.fn(),
  pacpilotStatus: vi.fn(),
}));
const notify = vi.hoisted(() => vi.fn());
const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
const route = vi.hoisted(() => ({ hash: "" }));

vi.mock("@/api/client", () => ({ api }));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ notify }) }));
vi.mock("vue-router", () => ({ useRouter: () => router, useRoute: () => route }));
vi.mock("vue-i18n", async (importOriginal) => {
  const actual = await importOriginal<typeof import("vue-i18n")>();
  return {
    ...actual,
    useI18n: () => ({ t: (key: string) => key, locale: { value: "zh_CN" } }),
  };
});

type SettingsApi = Awaited<
  ReturnType<(typeof import("../src/composables/useAdminSettings"))["useAdminSettings"]>
>;

function settings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    mode: "custom",
    pacProxy: "",
    pacCompress: true,
    pacObfuscate: false,
    listUrl: "",
    blockList: [],
    directList: [],
    cronSchedule: "",
    timezone: "Asia/Shanghai",
    logRetentionDays: 30,
    ...overrides,
  };
}

/** 挂载 composable，返回 API 与卸载函数；onMounted 里的 load() 会被驱动一次。 */
async function setup(initial: AppSettings): Promise<{ api: SettingsApi; unmount: () => void }> {
  vi.resetModules();
  // 用一个有状态的假服务端：保存会真正改变后续读取到的配置，这样才能
  // 复现「第二次保存基于第一次结果」的串行语义。
  let stored = { ...initial };
  api.session.mockResolvedValue({ loggedIn: true, adminCredentialsMissing: false });
  api.settings.mockImplementation(async () => ({ ...stored }));
  api.saveSettings.mockImplementation(async (body: AppSettings) => {
    stored = { ...body };
    return body;
  });
  api.saveAndGenerate.mockImplementation(async (body: AppSettings) => {
    stored = { ...body };
    return body;
  });
  api.pacpilotStatus.mockResolvedValue({ available: true, command: "pacpilot", detail: "" });

  const { useAdminSettings } = await import("../src/composables/useAdminSettings");
  let result: SettingsApi | null = null;
  const wrapper = mount(
    defineComponent({
      setup() {
        result = useAdminSettings();
        return () => null;
      },
    })
  );
  await vi.waitFor(() => expect(result?.loading.value).toBe(false));
  return { api: result as unknown as SettingsApi, unmount: () => wrapper.unmount() };
}

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  notify.mockReset();
  router.replace.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("saveMode", () => {
  it("submits the default list URL when switching to remote with an empty address", async () => {
    const { api: settingsApi, unmount } = await setup(settings({ mode: "custom", listUrl: "" }));

    settingsApi.onModeChange("remote");
    settingsApi.saveMode();
    await vi.waitFor(() => expect(api.saveAndGenerate).toHaveBeenCalledTimes(1));

    const payload = api.saveAndGenerate.mock.calls[0]![0] as AppSettings;
    expect(payload.mode).toBe("remote");
    expect(payload.listUrl).toBe(DEFAULT_LIST_URL);
    expect(notify).toHaveBeenCalledWith("settings.savedMode", "success");
    unmount();
  });

  it("keeps a user-provided remote address untouched", async () => {
    const custom = "https://rules.example.com/list.txt";
    const { api: settingsApi, unmount } = await setup(settings({ mode: "custom", listUrl: "" }));

    settingsApi.onModeChange("remote");
    settingsApi.form.listUrl = custom;
    settingsApi.saveMode();
    await vi.waitFor(() => expect(api.saveAndGenerate).toHaveBeenCalledTimes(1));

    expect((api.saveAndGenerate.mock.calls[0]![0] as AppSettings).listUrl).toBe(custom);
    unmount();
  });

  it("does not submit an invalid remote address", async () => {
    const { api: settingsApi, unmount } = await setup(settings({ mode: "custom", listUrl: "" }));

    settingsApi.onModeChange("remote");
    settingsApi.form.listUrl = "not-a-url";
    settingsApi.saveMode();
    await vi.waitFor(() => expect(notify).toHaveBeenCalledWith("settings.listUrlInvalid", "warning"));

    expect(api.saveAndGenerate).not.toHaveBeenCalled();
    unmount();
  });
});

describe("serialized saves", () => {
  it("queues a blur commit and the following mode save instead of racing them", async () => {
    const { api: settingsApi, unmount } = await setup(settings({ mode: "remote", listUrl: "" }));

    // 模拟失焦提交与随后的保存按钮点击在同一帧内先后触发。
    settingsApi.form.listUrl = "";
    settingsApi.onListUrlCommit();
    settingsApi.onModeChange("custom");
    settingsApi.saveMode();

    await vi.waitFor(() => expect(api.saveAndGenerate).toHaveBeenCalledTimes(2));

    // 两次提交串行，后一次基于前一次的结果，最终 mode 不会被旧快照覆盖。
    const first = api.saveAndGenerate.mock.calls[0]![0] as AppSettings;
    const second = api.saveAndGenerate.mock.calls[1]![0] as AppSettings;
    expect(first.listUrl).toBe(DEFAULT_LIST_URL);
    expect(second.mode).toBe("custom");
    expect(second.listUrl).toBe(DEFAULT_LIST_URL);
    expect(api.saveAndGenerate.mock.invocationCallOrder[0]).toBeLessThan(
      api.saveAndGenerate.mock.invocationCallOrder[1]!
    );
    unmount();
  });
});
