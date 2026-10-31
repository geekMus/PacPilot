<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import { useI18n } from "vue-i18n";
import {
  ComboboxAnchor,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxPortal,
  ComboboxRoot,
  ComboboxViewport,
} from "reka-ui";
import AppIcon from "@/components/AppIcon.vue";
import AppScrollArea from "@/components/AppScrollArea.vue";
import { commonTimeZones, isValidTimeZone } from "@/utils/time-zones";

const props = defineProps<{ modelValue: string; disabled?: boolean }>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();

const { t } = useI18n();
const menuOpen = ref(false);
const anchorEl = ref<HTMLElement | null>(null);
const query = ref("");

const filteredTimeZones = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return commonTimeZones;
  return commonTimeZones.filter(
    (zone) =>
      zone.value.toLowerCase().includes(q) || String(t(zone.labelKey)).toLowerCase().includes(q)
  );
});

const invalid = computed(() => !isValidTimeZone(props.modelValue));

// 只有从候选项里选中或点击预设按钮才会提交；输入框里自由键入的文本不直接落库，
// 避免把半截时区字符串写进设置。
// 选择提交后由程序把焦点还给输入框；此标记让 focus 处理器不要因此重新打开菜单。
let restoringFocusAfterCommit = false;

function commit(value: string) {
  query.value = value;
  menuOpen.value = false;
  if (value !== props.modelValue) emit("update:modelValue", value);
  // 焦点不还给输入框的话会落回 body，焦点环渐隐在视觉上就是选择框"闪一下"。
  restoringFocusAfterCommit = true;
  nextTick(() => {
    anchorEl.value?.querySelector("input")?.focus({ preventScroll: true });
    restoringFocusAfterCommit = false;
  });
}
</script>

<template>
  <div class="timezone-field">
    <label for="timezone">{{ t("settings.timezone") }}</label>
    <ComboboxRoot
      :model-value="modelValue"
      :open="menuOpen"
      :search-term="query"
      :disabled="disabled"
      class="timezone-combobox"
      @update:open="menuOpen = $event"
      @update:model-value="commit(String($event))"
      @update:search-term="query = $event"
    >
      <ComboboxAnchor as-child>
        <div ref="anchorEl" class="timezone-picker">
          <ComboboxInput
            id="timezone"
            class="timezone-combobox-input"
            autocomplete="off"
            spellcheck="false"
            :display-value="(value) => String(value ?? '')"
            :placeholder="t('settings.timezoneSearch')"
            :aria-invalid="invalid"
            @focus="
              if (!restoringFocusAfterCommit) {
                menuOpen = true;
                query = '';
              }
            "
          />
          <AppIcon class="timezone-picker-icon" name="chevron-down" :size="15" aria-hidden="true" />
        </div>
      </ComboboxAnchor>
      <ComboboxPortal>
        <ComboboxContent
          class="timezone-options-menu"
          position="popper"
          align="start"
          :side-offset="5"
          :collision-padding="10"
        >
          <AppScrollArea
            root-class="timezone-options-scroll-area"
            viewport-class="timezone-options-viewport"
            orientation="vertical"
            type="hover"
          >
            <template #viewport="{ viewportComponent, viewportClass, onScroll }">
              <ComboboxViewport as-child>
                <component
                  :is="viewportComponent"
                  :class="viewportClass"
                  @scroll.passive="onScroll"
                >
                  <ComboboxItem
                    v-for="zone in filteredTimeZones"
                    :key="zone.value"
                    :value="zone.value"
                    class="timezone-option"
                  >
                    <span>{{ t(zone.labelKey) }}</span>
                    <code>{{ zone.value }}</code>
                  </ComboboxItem>
                  <ComboboxEmpty class="timezone-no-results">
                    {{ t("settings.timezoneNoMatch") }}
                  </ComboboxEmpty>
                </component>
              </ComboboxViewport>
            </template>
          </AppScrollArea>
        </ComboboxContent>
      </ComboboxPortal>
    </ComboboxRoot>
    <p v-if="invalid" class="timezone-error" role="alert">{{ t("settings.timezoneInvalid") }}</p>
    <p class="timezone-hint">{{ t("settings.timezoneHintFull") }}</p>
    <div class="timezone-presets">
      <button
        v-for="zone in commonTimeZones.slice(0, 6)"
        :key="zone.value"
        type="button"
        class="timezone-chip"
        :class="{ active: modelValue === zone.value }"
        :disabled="disabled"
        @click="commit(zone.value)"
      >
        {{ t(zone.labelKey) }}
      </button>
    </div>
  </div>
</template>

<style scoped>
@reference "@/styles/tailwind.css";

.timezone-field {
  @apply grid gap-[7px];
}
.timezone-field > label {
  @apply text-[13px] font-semibold;
  color: var(--text);
}
.timezone-combobox {
  @apply block w-full min-w-0;
}
.timezone-picker {
  @apply relative flex w-full min-w-0 items-center;
}
.timezone-combobox-input {
  @apply block box-border w-full min-w-0 rounded-lg border px-3 py-2.5 text-xs leading-snug outline-none transition-[border-color,box-shadow];
  min-height: 42px;
  padding-right: 38px;
  border-color: var(--line);
  background: var(--surface);
  color: var(--text);
}
.timezone-combobox-input::placeholder {
  @apply opacity-100;
  color: var(--muted);
}
.timezone-combobox:focus-within .timezone-combobox-input {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.timezone-combobox-input[aria-invalid="true"] {
  border-color: var(--red);
}
.timezone-picker-icon {
  @apply pointer-events-none absolute right-3;
  color: var(--muted);
}
.timezone-hint {
  @apply m-0 text-[11px] leading-normal;
  color: var(--muted);
}
.timezone-error {
  @apply m-0 text-xs font-semibold leading-snug;
  color: var(--red);
}
.timezone-presets {
  @apply mt-1 flex flex-wrap gap-2;
}
.timezone-chip {
  @apply min-h-[34px] cursor-pointer appearance-none rounded-full border px-3.5 text-xs font-semibold transition-[background,border-color,color];
  border-color: var(--line);
  background: var(--surface-2);
  color: var(--text);
}
.timezone-chip:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--accent) 40%, var(--line));
  color: var(--accent);
}
.timezone-chip.active {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--accent);
}
.timezone-chip:disabled {
  @apply cursor-not-allowed opacity-60;
}
</style>
