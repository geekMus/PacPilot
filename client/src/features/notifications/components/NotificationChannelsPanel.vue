<script setup lang="ts">
import { computed, defineAsyncComponent, ref } from "vue";
import { useI18n } from "vue-i18n";
import AppButton from "@/components/AppButton.vue";
import AppIcon from "@/components/AppIcon.vue";
import AppIconButton from "@/components/AppIconButton.vue";
import AppInput from "@/components/AppInput.vue";
import AppScrollArea from "@/components/AppScrollArea.vue";
import AppSelect from "@/components/AppSelect.vue";
import AppToggle from "@/components/AppToggle.vue";
import ConfirmPopover from "@/components/ConfirmPopover.vue";
import type { NotificationWorkspace } from "@/features/notifications/composables/useNotificationWorkspace";
import type { NotificationChannel } from "@shared/contracts";

// 编辑器（CodeMirror）约 300KB，异步加载：仅在真正打开渠道编辑器时才拉取，
// 通知页首屏不再为此付出加载与解析成本。
const WebhookBodyEditor = defineAsyncComponent(
  () => import("@/features/webhooks/components/WebhookBodyEditor.vue")
);

const props = defineProps<{ ws: NotificationWorkspace }>();
// 逐行记录哪个渠道正在等待删除确认，避免同一时间弹出多个确认气泡。
const confirmingDeleteId = ref<string | null>(null);
const { t, tm } = useI18n();
const {
  channels,
  enabledChannels,
  cid,
  ch,
  busy,
  testingId,
  showSecret,
  channelReady,
  channelErrors,
  providerOptions,
  messageTypeOptions,
  methodOptions,
  channelEditorOpen,
  providerName,
  shortUrl,
  setProvider,
  setMessageType,
  setMethod,
  resetC,
  editC,
  saveC,
  deleteC,
  testC,
} = props.ws;

// 默认内容只在用户点「填入默认值」时写入编辑框；占位符只给一行简短提示，
// 不再展示完整默认内容（那看起来就像预填了默认值）。
// 占位符变量（{{event}} 等）在发送时由服务端替换。
const headersDefault = JSON.stringify({ Authorization: "Bearer …" }, null, 2);
const bodyTemplateDefault = JSON.stringify(
  {
    event: "{{event}}",
    status: "{{status}}",
    ok: "{{ok}}",
    message: "{{message}}",
    timestamp: "{{timestamp}}",
  },
  null,
  2
);
const headersPlaceholder = '{"Authorization": "Bearer …"}';
const bodyPlaceholder = '{"event": "{{event}}", "message": "{{message}}"}';
// 模板默认值含 {{var}} 占位符，必须用 tm() 取原始文案，避免 t() 做插值。
function rawTemplate(key: string): string {
  const message = tm(key);
  return typeof message === "string" ? message : "";
}
const dingTalkTemplateDefault = computed(() => rawTemplate("settings.defaultMessageTemplate"));
const dingTalkTestTemplateDefault = computed(() => rawTemplate("settings.testMessageTemplate"));
const dingTalkTemplatePlaceholder = computed(() =>
  rawTemplate("notifications.placeholderMessageTemplate")
);
const dingTalkTestTemplatePlaceholder = computed(() =>
  rawTemplate("notifications.placeholderTestMessage")
);

// 编辑区底部的删除按钮和列表行共用同一套确认流程：把待删除的渠道记下来，
// 由确认气泡真正执行删除，避免任何入口变成「点一下就没」。
const footerDeleteOpen = ref(false);
const footerDeleteItem = ref<NotificationChannel | null>(null);

function toggleDelete(toggle: () => void, open: boolean) {
  if (!open) confirmingDeleteId.value = null;
  toggle();
}

function openFooterDelete(): void {
  confirmingDeleteId.value = null;
  footerDeleteItem.value = channels.value.find((item) => item.id === cid.value) ?? null;
  footerDeleteOpen.value = footerDeleteItem.value !== null;
}

async function confirmFooterDelete(): Promise<void> {
  const item = footerDeleteItem.value;
  footerDeleteOpen.value = false;
  footerDeleteItem.value = null;
  if (item) await deleteC(item);
}

async function confirmDeleteChannel(item: NotificationChannel) {
  confirmingDeleteId.value = null;
  await deleteC(item);
}
</script>

<template>
  <section class="workspace-layout">
    <section class="directory-panel">
      <header class="panel-heading">
        <span class="panel-heading-icon"><AppIcon name="network" :size="16" /></span>
        <div class="panel-heading-copy">
          <h3>{{ t("notifications.channelsTitle") }}</h3>
          <p>{{ t("notifications.channelsPanelHint") }}</p>
        </div>
        <AppIconButton :label="t('notifications.newChannel')" @click="resetC">＋</AppIconButton>
      </header>
      <AppScrollArea root-class="panel-scroll" type="auto">
        <div v-if="!channels.length" class="empty-directory">
          <span class="empty-icon"><AppIcon name="network" :size="22" /></span>
          <strong>{{ t("notifications.emptyChannels") }}</strong>
          <p>{{ t("notifications.emptyChannelsHint") }}</p>
          <AppButton variant="primary" block @click="resetC">{{
            t("notifications.createFirstChannel")
          }}</AppButton>
        </div>
        <div
          v-for="item in channels"
          :key="item.id"
          class="directory-item"
          :class="{ selected: cid === item.id }"
          role="button"
          tabindex="0"
          @click="editC(item)"
          @keydown.enter.prevent="editC(item)"
          @keydown.space.prevent="editC(item)"
        >
          <span class="provider-icon"
            ><AppIcon :name="item.provider === 'dingtalk' ? 'bell-ring' : 'globe'" :size="18"
          /></span>
          <span class="directory-content"
            ><strong>{{ item.name }}</strong
            ><small>{{ providerName(item.provider) }}</small
            ><small class="url-preview">{{
              shortUrl(item.config.url) || t("notifications.urlUnset")
            }}</small></span
          >
          <span
            class="status-dot"
            :class="{ online: item.enabled }"
            :title="
              item.enabled ? t('notifications.statusEnabled') : t('notifications.statusDisabled')
            "
          ></span>
          <ConfirmPopover
            :open="confirmingDeleteId === item.id"
            :title="t('notifications.deleteChannelTitle', { name: item.name })"
            :description="t('notifications.confirmDeleteChannel', { name: item.name })"
            :confirm-text="t('common.delete')"
            :cancel-text="t('common.back')"
            :busy-text="t('common.processing')"
            :busy="busy"
            @update:open="confirmingDeleteId = $event ? item.id : null"
            @confirm="confirmDeleteChannel(item)"
          >
            <template #trigger="{ toggle, open }">
              <AppIconButton
                class="row-delete"
                size="sm"
                danger
                :label="t('notifications.deleteChannelTitle', { name: item.name })"
                :disabled="busy"
                @click.stop="toggleDelete(toggle, open)"
                ><AppIcon name="trash-2" :size="14"
              /></AppIconButton>
            </template>
          </ConfirmPopover>
        </div>
      </AppScrollArea>
      <footer v-if="channels.length" class="panel-footer">
        <span class="status-dot online"></span>
        {{ t("notifications.channelsEnabledCount", { count: enabledChannels.length }) }}
      </footer>
    </section>

    <form v-if="channelEditorOpen" class="editor-panel" @submit.prevent="saveC">
      <header class="editor-heading">
        <div class="editor-title-mark"><AppIcon name="network" :size="19" /></div>
        <div class="editor-heading-copy">
          <div class="editor-kicker">
            {{ cid ? t("notifications.channelKickerEdit") : t("notifications.channelKickerNew") }}
          </div>
          <h3>{{ cid ? t("notifications.channelEdit") : t("notifications.channelNew") }}</h3>
          <p>{{ t("notifications.channelDesc") }}</p>
        </div>
        <div class="editor-heading-tools">
          <span class="status-pill" :class="ch.enabled ? 'pill-enabled' : 'pill-disabled'"
            ><span class="status-dot" :class="{ online: ch.enabled }"></span
            >{{
              ch.enabled ? t("notifications.statusEnabled") : t("notifications.statusDisabled")
            }}</span
          >
        </div>
      </header>
      <AppScrollArea root-class="editor-scroll" type="auto"
        ><div class="editor-body">
          <section class="form-section">
            <div class="section-title">
              <span>01</span>
              <div>
                <h4>{{ t("notifications.sectionBasics") }}</h4>
                <p>{{ t("notifications.sectionBasicsHint") }}</p>
              </div>
            </div>
            <div class="field-grid">
              <label class="field"
                ><span>{{ t("notifications.fieldName") }} <i>*</i></span
                ><AppInput
                  v-model="ch.name"
                  required
                  maxlength="80"
                  :placeholder="t('notifications.placeholderChannelName')"
              /></label>
              <label class="field"
                ><span>{{ t("notifications.fieldProvider") }} <i>*</i></span
                ><AppSelect
                  block
                  :model-value="ch.config.provider"
                  :options="providerOptions"
                  @update:model-value="setProvider"
              /></label>
            </div>
          </section>

          <section class="form-section">
            <div class="section-title">
              <span>02</span>
              <div>
                <h4>{{ t("notifications.sectionConnection") }}</h4>
                <p>{{ t("notifications.sectionConnectionHint") }}</p>
              </div>
            </div>
            <label class="field">
              <span>{{ t("notifications.fieldUrl") }} <i>*</i></span>
              <CodeMirrorField
                :model-value="ch.config.url"
                single-line
                :height="42"
                language="text"
                :aria-label="t('notifications.fieldUrl')"
                :placeholder="
                  ch.config.provider === 'dingtalk'
                    ? t('notifications.placeholderUrlDingTalk')
                    : t('notifications.placeholderUrlHttp')
                "
                @update:model-value="ch.config.url = $event"
              />
              <small class="field-hint"
                ><AppIcon name="shield-check" :size="13" />
                {{ t("notifications.hintUrlRedacted") }}</small
              >
            </label>
            <template v-if="ch.config.provider === 'dingtalk'">
              <label class="field">
                <span
                  >{{ t("notifications.fieldSecret") }}
                  <em>{{ t("notifications.optional") }}</em></span
                >
                <div class="secret-input">
                  <AppInput
                    v-model="ch.config.dingTalkSecret"
                    :type="showSecret ? 'text' : 'password'"
                    autocomplete="new-password"
                    :placeholder="
                      cid && channels.find((x) => x.id === cid)?.hasSecret
                        ? t('notifications.placeholderSecretSaved')
                        : t('notifications.placeholderSecretNew')
                    "
                  />
                  <AppIconButton
                    :label="t('notifications.fieldSecret')"
                    @click="showSecret = !showSecret"
                    ><AppIcon :name="showSecret ? 'eye-off' : 'eye'" :size="16"
                  /></AppIconButton>
                </div>
                <small class="field-hint">{{ t("notifications.hintSecretHidden") }}</small>
              </label>
              <label class="field"
                ><span>{{ t("notifications.fieldMessageType") }}</span
                ><AppSelect
                  block
                  :model-value="ch.config.dingTalkMessageType"
                  :options="messageTypeOptions"
                  @update:model-value="setMessageType"
              /></label>
              <label class="field"
                ><span>{{ t("notifications.fieldMessageTemplate") }}</span
                ><WebhookBodyEditor
                  :model-value="ch.config.messageTemplate"
                  language="text"
                  :line-numbers="false"
                  :height="120"
                  :sample="dingTalkTemplateDefault"
                  :placeholder="dingTalkTemplatePlaceholder"
                  :aria-label="t('notifications.fieldMessageTemplate')"
                  @update:model-value="ch.config.messageTemplate = $event"
                /><small class="field-hint"
                  >{{ t("notifications.hintVariables") }}<code v-pre>{{ event }}</code
                  >、<code v-pre>{{ status }}</code
                  >、<code v-pre>{{ message }}</code
                  >、<code v-pre>{{ timestamp }}</code
                  >、<code v-pre>{{ ok }}</code
                  >。</small
                ></label
              >
              <label class="field"
                ><span>{{ t("notifications.fieldTestMessage") }}</span
                ><WebhookBodyEditor
                  :model-value="ch.config.testMessageTemplate"
                  language="text"
                  :line-numbers="false"
                  :height="82"
                  :sample="dingTalkTestTemplateDefault"
                  :placeholder="dingTalkTestTemplatePlaceholder"
                  :aria-label="t('notifications.fieldTestMessage')"
                  @update:model-value="ch.config.testMessageTemplate = $event"
              /></label>
            </template>
            <template v-else>
              <div class="field-grid">
                <label class="field"
                  ><span>{{ t("notifications.fieldMethod") }}</span
                  ><AppSelect
                    block
                    :model-value="ch.config.method"
                    :options="methodOptions"
                    @update:model-value="setMethod"
                /></label>
                <label class="field"
                  ><span>{{ t("notifications.fieldContentType") }}</span>
                  <div class="field-static">
                    <AppIcon name="file-text" :size="15" /> application/json
                  </div></label
                >
              </div>
              <label class="field"
                ><span
                  >{{ t("notifications.fieldHeaders") }}
                  <em>{{ t("notifications.json") }}</em></span
                ><WebhookBodyEditor
                  :model-value="ch.config.headers"
                  :height="126"
                  :sample="headersDefault"
                  :placeholder="headersPlaceholder"
                  :aria-label="t('notifications.fieldHeaders')"
                  @update:model-value="ch.config.headers = $event"
                /><small class="field-hint">{{
                  t("notifications.hintHeadersRedacted")
                }}</small></label
              >
              <label class="field"
                ><span
                  >{{ t("notifications.fieldBody") }} <em>{{ t("notifications.json") }}</em></span
                ><WebhookBodyEditor
                  :model-value="ch.config.body"
                  :height="190"
                  :sample="bodyTemplateDefault"
                  :placeholder="bodyPlaceholder"
                  :aria-label="t('notifications.fieldBody')"
                  @update:model-value="ch.config.body = $event"
                /><small class="field-hint">{{ t("notifications.hintBodyJson") }}</small></label
              >
              <label class="field"
                ><span
                  >{{ t("notifications.fieldTestBody") }}
                  <em>{{ t("notifications.json") }}</em></span
                ><WebhookBodyEditor
                  :model-value="ch.config.testBody"
                  :height="144"
                  :sample="bodyTemplateDefault"
                  :placeholder="bodyPlaceholder"
                  :aria-label="t('notifications.fieldTestBody')"
                  @update:model-value="ch.config.testBody = $event"
              /></label>
            </template>
          </section>
          <section class="form-section compact-section">
            <div class="section-title">
              <span>03</span>
              <div>
                <h4>{{ t("notifications.sectionChannelStatus") }}</h4>
                <p>{{ t("notifications.sectionChannelStatusHint") }}</p>
              </div>
            </div>
            <AppToggle
              v-model="ch.enabled"
              :label="t('notifications.toggleChannel')"
              :description="t('notifications.toggleChannelHint')"
            />
          </section></div
      ></AppScrollArea>
      <footer class="editor-footer">
        <AppButton variant="secondary" @click="resetC">{{
          t("notifications.buttonNewBlank")
        }}</AppButton>
        <ConfirmPopover
          :open="footerDeleteOpen"
          :title="t('notifications.deleteChannelTitle', { name: footerDeleteItem?.name ?? '' })"
          :description="
            t('notifications.confirmDeleteChannel', { name: footerDeleteItem?.name ?? '' })
          "
          :confirm-text="t('common.delete')"
          :cancel-text="t('common.back')"
          :busy-text="t('common.processing')"
          :busy="busy"
          @update:open="footerDeleteOpen = $event"
          @confirm="confirmFooterDelete"
        >
          <template #trigger>
            <AppButton
              v-if="cid"
              variant="danger-ghost"
              :disabled="busy"
              @click.stop="openFooterDelete"
              ><AppIcon name="trash-2" :size="15" /> {{ t("common.delete") }}</AppButton
            >
          </template>
        </ConfirmPopover>
        <span class="footer-spacer"></span>
        <AppButton
          variant="secondary"
          :disabled="!cid || (!!testingId && testingId === cid)"
          @click="testC(channels.find((x) => x.id === cid))"
          ><AppIcon
            :name="!!testingId && testingId === cid ? 'loader-circle' : 'activity'"
            :size="15"
            :class="{ spin: !!testingId && testingId === cid }"
          />
          {{
            !!testingId && testingId === cid
              ? t("notifications.buttonTesting")
              : t("notifications.buttonTest")
          }}</AppButton
        >
        <AppButton
          type="submit"
          variant="primary"
          :disabled="busy || !ch.name.trim() || !ch.config.url.trim() || channelErrors.length > 0"
          ><AppIcon name="save" :size="15" />
          {{
            busy ? t("notifications.buttonSaving") : t("notifications.buttonSaveChannel")
          }}</AppButton
        >
      </footer>
      <div v-if="channelErrors.length" class="editor-note" role="alert">
        <AppIcon name="circle-alert" :size="15" /> {{ channelErrors.join(" ") }}
      </div>
      <div v-else-if="cid && !channelReady" class="editor-note">
        <AppIcon name="info" :size="15" /> {{ t("notifications.hintChannelIncomplete") }}
      </div>
    </form>
    <section v-else class="editor-panel editor-placeholder" aria-live="polite">
      <div class="placeholder-icon"><AppIcon name="file-text" :size="22" /></div>
      <p>{{ t("notifications.selectHint") }}</p>
    </section>
  </section>
</template>
