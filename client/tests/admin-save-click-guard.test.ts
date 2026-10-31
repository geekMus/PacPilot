/// <reference types="node" />
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 设置页的保存按钮必须始终能收到点击。
 *
 * 输入框失焦会在 mousedown 之后、click 之前触发 change 并开始一次保存。如果
 * 那次保存让按钮变成 disabled、或让表单变成 inert，浏览器就会丢弃紧接着到达
 * 的 click，用户「改完地址直接点保存」的操作完全无效。保存的并发正确性由
 * useAdminSettings 的串行队列保证，界面层不能靠禁用控件来互斥。
 */

function readSource(path: string): string {
  return readFileSync(resolve(process.cwd(), "client", "src", path), "utf8");
}

/** 去掉 HTML 注释，避免说明性文字（例如解释为什么不要加 inert）干扰断言。 */
function withoutComments(source: string): string {
  return source.replace(/<!--[\s\S]*?-->/g, "");
}

/** 取出包含指定 @click 处理函数的那一个 <button> 开标签。 */
function buttonTag(source: string, handler: string): string {
  const index = source.indexOf(`@click="${handler}"`);
  expect(index, `找不到 @click="${handler}" 的按钮`).toBeGreaterThan(-1);
  const start = source.lastIndexOf("<button", index);
  expect(start, `@click="${handler}" 不在 <button> 标签内`).toBeGreaterThan(-1);
  return source.slice(start, index);
}

describe("admin settings save buttons stay clickable", () => {
  it("does not freeze the settings form while a save is in flight", () => {
    const view = withoutComments(readSource("views/AdminView.vue"));
    expect(view).not.toContain(':inert="saving"');
  });

  it("keeps the mode and rules save buttons enabled while saving", () => {
    const view = withoutComments(readSource("views/AdminView.vue"));
    for (const [handler, slot] of [
      ["saveMode", "mode"],
      ["saveRules", "rules"],
    ] as const) {
      const tag = buttonTag(view, handler);
      expect(tag, `${handler} 按钮不能因为 saving 而 disabled`).not.toMatch(
        /:disabled="[^"]*\bsaving\b/
      );
      expect(tag, `${handler} 按钮需要暴露 aria-busy`).toContain(
        `:aria-busy="isSaving('${slot}')"`
      );
      expect(tag, `${handler} 按钮需要保留加载态类名`).toContain(
        `'is-loading': isSaving('${slot}')`
      );
      // 各卡片按钮只随本卡片保存而闪烁：不得绑定全局 saving。
      expect(tag, `${handler} 按钮不得绑定全局 saving`).not.toContain("saving");
    }
  });

  it("does not make the loading appearance depend on a disabled button", () => {
    // 保存中的按钮保持可点击，所以加载态样式只能挂在 .is-loading 上；
    // 一旦选择器重新要求 :disabled，保存中就会退回普通按钮外观。
    expect(readSource("styles/theme.css")).not.toMatch(/is-loading[^{,]*:disabled/);
  });
});
