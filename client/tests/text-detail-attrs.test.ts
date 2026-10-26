import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { i18n } from "../src/i18n";
import TextDetail from "@/components/TextDetail.vue";

/**
 * TextDetail 的模板是 fragment root（触发按钮 + 详情弹窗）。Vue 无法为多根组件自动
 * 继承 class/style 等非 props 属性，既会刷 "Extraneous non-props attributes" 警告，
 * 也让父组件传下来的 class 失效。这里锁定「属性必须落到触发按钮上，且不再告警」。
 */
function mountWithAttrs() {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const wrapper = mount(TextDetail, {
    props: { text: "example.com", label: "域名规则" },
    attrs: { class: "domain-detail", "data-probe": "row" },
    slots: { default: () => "example.com" },
    global: { plugins: [i18n] },
  });
  return { wrapper, warn };
}

describe("TextDetail attribute fallthrough", () => {
  it("forwards non-prop attributes to the trigger button", () => {
    const { wrapper, warn } = mountWithAttrs();
    const trigger = wrapper.get("button.text-detail-trigger");

    expect(trigger.classes()).toContain("domain-detail");
    expect(trigger.attributes("data-probe")).toBe("row");
    // 组件自身的类名不能被父组件的属性覆盖。
    expect(trigger.classes()).toContain("text-detail-trigger");

    const fragmentWarnings = warn.mock.calls.filter((call) =>
      String(call[0]).includes("Extraneous non-props attributes")
    );
    expect(fragmentWarnings).toHaveLength(0);

    warn.mockRestore();
    wrapper.unmount();
  });
});
