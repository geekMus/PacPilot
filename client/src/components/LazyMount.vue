<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";

/**
 * 进入视口附近才挂载内容的懒渲染容器。
 *
 * 用于把首屏之外的重型组件（如 CodeMirror 规则编辑器，约 100KB gzip）移出
 * 首屏关键路径；挂载前按 minHeight 预留高度，避免内容出现时引起布局偏移。
 * 不支持 IntersectionObserver 的环境立即挂载，行为退化为直接渲染。
 */
const props = withDefaults(
  defineProps<{
    /** 挂载前占位高度（px），应与内容渲染后的高度量级一致。 */
    minHeight?: number;
    /** 提前多少像素开始挂载（视口外缓冲区）。 */
    rootMargin?: number;
  }>(),
  { minHeight: 320, rootMargin: 240 }
);

const host = ref<HTMLElement | null>(null);
const visible = ref(false);
let observer: IntersectionObserver | null = null;

onMounted(() => {
  if (!host.value || typeof IntersectionObserver === "undefined") {
    visible.value = true;
    return;
  }
  observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        visible.value = true;
        observer?.disconnect();
        observer = null;
      }
    },
    { rootMargin: `${props.rootMargin}px 0px` }
  );
  observer.observe(host.value);
});

onBeforeUnmount(() => {
  observer?.disconnect();
  observer = null;
});
</script>

<template>
  <div ref="host" :style="visible ? undefined : { minHeight: `${minHeight}px` }">
    <slot v-if="visible" />
  </div>
</template>
