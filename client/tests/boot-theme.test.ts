/// <reference types="node" />
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initThemeEarly } from "../src/composables/useTheme";

/**
 * 启动占位（client/index.html 的 boot shell）必须跟随应用内保存的主题。
 *
 * 入口脚本要等 JS 包下载、解析、执行完才运行，在那之前页面上只有占位：
 * 它的明暗只能由 index.html 里的内联脚本决定，晚一步就先闪一帧反色。
 * 这段脚本和 useTheme.ts 是两份实现（前者不能用打包产物，后者不该内联进 HTML），
 * 所以这里既验证它自己的行为，也验证它和 initThemeEarly 解析出同一个结果：
 * 任何一边改了 storage key、取值集合或主题类名，都会在这里失败。
 */

const STORAGE_KEY = "pacpilot-theme";

type Stored = string | null;

interface Case {
  label: string;
  stored: Stored;
  /** 系统（prefers-color-scheme）是否为深色。 */
  systemDark: boolean;
  /** localStorage 是否不可读（隐私模式等）。 */
  unreadable?: boolean;
  expected: "light" | "dark";
}

const CASES: readonly Case[] = [
  { label: "深色主题 + 浅色系统", stored: "dark", systemDark: false, expected: "dark" },
  { label: "深色主题 + 深色系统", stored: "dark", systemDark: true, expected: "dark" },
  { label: "浅色主题 + 深色系统", stored: "light", systemDark: true, expected: "light" },
  { label: "浅色主题 + 浅色系统", stored: "light", systemDark: false, expected: "light" },
  { label: "跟随系统 + 深色系统", stored: "system", systemDark: true, expected: "dark" },
  { label: "跟随系统 + 浅色系统", stored: "system", systemDark: false, expected: "light" },
  { label: "未保存过偏好 + 深色系统", stored: null, systemDark: true, expected: "dark" },
  { label: "未保存过偏好 + 浅色系统", stored: null, systemDark: false, expected: "light" },
  { label: "非法取值 + 深色系统", stored: "not-a-mode", systemDark: true, expected: "dark" },
  {
    label: "存储不可读 + 深色系统",
    stored: null,
    systemDark: true,
    unreadable: true,
    expected: "dark",
  },
  {
    label: "存储不可读 + 浅色系统",
    stored: null,
    systemDark: false,
    unreadable: true,
    expected: "light",
  },
];

function readIndexHtml(): string {
  return readFileSync(resolve(process.cwd(), "client", "index.html"), "utf8");
}

/**
 * 取出 index.html 里那段内联脚本。
 *
 * 只匹配不带任何属性的 `<script>`：入口脚本写作 `<script type="module" src=…>`，
 * 不会被命中；反过来这条断言也保证了主题脚本是同步执行的，没有被写成 module
 * （module 脚本是延迟的，那时占位页已经画出来了）。
 */
function bootThemeScript(): string {
  const html = readIndexHtml();
  const match = /<script>([\s\S]*?)<\/script>/.exec(html);
  if (!match) throw new Error("client/index.html 里找不到启动主题脚本");
  const index = html.indexOf(match[0]);
  expect(index, "启动主题脚本必须位于 <body> 之前").toBeLessThan(html.indexOf("<body>"));
  return match[1];
}

/** 安装一个可观测的 localStorage 替身，并记录写入次数。 */
function installStorage(stored: Stored, unreadable = false): { writes: number } {
  const store = new Map<string, string>();
  if (stored !== null) store.set(STORAGE_KEY, stored);
  const state = { writes: 0 };
  const storage: Storage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key) {
      if (unreadable) throw new DOMException("storage is not available", "SecurityError");
      return store.get(String(key)) ?? null;
    },
    key(index) {
      return [...store.keys()][index] ?? null;
    },
    removeItem(key) {
      store.delete(String(key));
    },
    setItem(key, value) {
      state.writes += 1;
      store.set(String(key), String(value));
    },
  };
  vi.stubGlobal("localStorage", storage);
  return state;
}

function installMatchMedia(systemDark: boolean): void {
  vi.stubGlobal("matchMedia", (query: string) => {
    return {
      matches: systemDark && query.includes("dark"),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => true,
    } as unknown as MediaQueryList;
  });
}

/** 跑一遍 index.html 的启动脚本，返回占位页最终生效的明暗。 */
function bootScheme(testCase: Case): "light" | "dark" {
  document.documentElement.className = "";
  installStorage(testCase.stored, testCase.unreadable);
  new Function(bootThemeScript())();

  const classes = [...document.documentElement.classList];
  // 两个类同时存在会让 color-scheme 的最终取值取决于规则顺序，必须只会命中一个。
  expect(classes.length, `${testCase.label}: 启动脚本最多加一个主题类`).toBeLessThanOrEqual(1);
  if (classes.includes("theme-dark")) return "dark";
  if (classes.includes("theme-light")) return "light";
  // 不加类即「跟随系统」：占位页交给 color-scheme: light dark 实时解析。
  return testCase.systemDark ? "dark" : "light";
}

/** useTheme 在同等条件下解析出的明暗。 */
function appScheme(): "light" | "dark" {
  document.documentElement.className = "";
  initThemeEarly();
  return document.documentElement.classList.contains("theme-dark") ? "dark" : "light";
}

describe("boot shell theme", () => {
  beforeEach(() => {
    document.documentElement.className = "";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("按应用内保存的主题决定占位页明暗，而不是只跟随系统", () => {
    for (const testCase of CASES) {
      installMatchMedia(testCase.systemDark);
      expect(bootScheme(testCase), testCase.label).toBe(testCase.expected);
    }
  });

  it("与 useTheme 解析出的主题保持一致", () => {
    for (const testCase of CASES) {
      installMatchMedia(testCase.systemDark);
      const boot = bootScheme(testCase);
      // bootScheme 把 localStorage 换成了替身，appScheme 需要同一份存储状态。
      installStorage(testCase.stored, testCase.unreadable);
      expect(appScheme(), `${testCase.label}: 占位页与应用主题不一致`).toBe(boot);
    }
  });

  it("只读取偏好，不在启动阶段写回存储", () => {
    for (const testCase of CASES) {
      installMatchMedia(testCase.systemDark);
      document.documentElement.className = "";
      const state = installStorage(testCase.stored, testCase.unreadable);
      new Function(bootThemeScript())();
      expect(state.writes, `${testCase.label}: 启动阶段不得写入存储`).toBe(0);
    }
  });

  it("在入口样式表到达前自己声明主题对应的 color-scheme", () => {
    // 开发模式下样式由 JS 注入、静态托管下样式是一次单独往返，占位页不能等它：
    // 没有这两条规则，theme-dark/theme-light 在样式表到达前不会影响 Canvas 取色。
    const html = readIndexHtml();
    expect(html).toMatch(/html\.theme-dark\s*\{\s*color-scheme:\s*dark;/);
    expect(html).toMatch(/html\.theme-light\s*\{\s*color-scheme:\s*light;/);
  });
});
