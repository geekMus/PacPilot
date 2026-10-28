<script setup lang="ts">
import VueJsonPretty from "vue-json-pretty";
import "vue-json-pretty/lib/styles.css";
import AppScrollArea from "@/components/AppScrollArea.vue";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

defineProps<{
  /** 已解析的 JSON 数据；由调用方负责 JSON.parse，解析失败时回退到纯文本。 */
  data: JsonValue;
}>();
</script>

<template>
  <div class="json-tree-view">
    <AppScrollArea orientation="horizontal" type="auto" overscroll="contain">
      <div class="json-tree-inner">
        <VueJsonPretty :data="data" :deep="3" :show-length="true" :show-double-quotes="true" />
      </div>
    </AppScrollArea>
  </div>
</template>

<style scoped>
@reference "@/styles/tailwind.css";

.json-tree-view {
  @apply overflow-hidden rounded-[10px] border;
  border-color: var(--line);
  background: var(--surface-2);
}

/* 横向滚动交给公共组件 AppScrollArea，滚动条样式与全站统一；
   内边距放在滚动内容上，随内容一起滚动，避免滚动条与边框之间留白。 */
.json-tree-inner {
  @apply px-3 py-[11px];
  min-width: max-content;
}

/* 树根：统一项目等宽字体与字号，覆盖库默认的 Monaco 14px。 */
.json-tree-view :deep(.vjs-tree) {
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.7;
  text-align: left;
  min-width: max-content;
}

/* 键名用正文色，值的类型用项目强调令牌区分，形成"数据卡片"而非"编辑器"的观感。 */
.json-tree-view :deep(.vjs-key) {
  color: var(--text);
  white-space: nowrap;
}

.json-tree-view :deep(.vjs-colon) {
  color: var(--muted);
}

/* 括号与折叠箭头：中性色，悬停用主强调色。 */
.json-tree-view :deep(.vjs-tree-brackets) {
  color: var(--muted);
}

.json-tree-view :deep(.vjs-tree-brackets:hover) {
  color: var(--accent);
}

.json-tree-view :deep(.vjs-carets) {
  color: var(--muted);
}

.json-tree-view :deep(.vjs-carets:hover) {
  color: var(--accent);
}

/* 值类型配色：字符串/数字/布尔各自独立，空值低调。 */
.json-tree-view :deep(.vjs-value-string) {
  color: var(--green);
}

.json-tree-view :deep(.vjs-value-number) {
  color: var(--teal);
}

.json-tree-view :deep(.vjs-value-boolean) {
  color: var(--violet);
}

.json-tree-view :deep(.vjs-value-null),
.json-tree-view :deep(.vjs-value-undefined) {
  color: var(--muted);
}

/* 折叠计数注释（// N items）与缩进引导线。 */
.json-tree-view :deep(.vjs-comment) {
  color: var(--muted);
}

.json-tree-view :deep(.vjs-indent-unit.has-line) {
  border-left-color: var(--line);
}

/* 行悬停高亮用主强调色的柔和底，浅色/深色主题都适配。 */
.json-tree-view :deep(.vjs-tree-node:hover),
.json-tree-view :deep(.vjs-tree-node.is-highlight),
.json-tree-view :deep(.vjs-tree-node.dark:hover) {
  background-color: var(--accent-soft);
  border-radius: 4px;
}
</style>
