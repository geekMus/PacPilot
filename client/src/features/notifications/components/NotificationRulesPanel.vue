<script setup lang="ts">
import { useI18n } from "vue-i18n";
import AppButton from "@/components/AppButton.vue";
import AppCheckbox from "@/components/AppCheckbox.vue";
import AppIcon from "@/components/AppIcon.vue";
import AppIconButton from "@/components/AppIconButton.vue";
import AppInput from "@/components/AppInput.vue";
import AppScrollArea from "@/components/AppScrollArea.vue";
import AppSelect from "@/components/AppSelect.vue";
import AppToggle from "@/components/AppToggle.vue";
import type { NotificationWorkspace } from "@/features/notifications/composables/useNotificationWorkspace";

const props = defineProps<{ ws: NotificationWorkspace }>();
const { t } = useI18n();
const {
  tab,
  rules,
  enabledRules,
  channels,
  rid,
  rule,
  busy,
  ruleEditorOpen,
  phaseDescription,
  providerName,
  evName,
  phaseName,
  outcomeName,
  channelName,
  catalog,
  eventOptions,
  phaseOptions,
  outcomeOptions,
  setEvent,
  setPhase,
  setOutcome,
  toggleChannel,
  resetR,
  editR,
  saveR,
  deleteR,
} = props.ws;
</script>

<template>
  <section class="workspace-layout rule-layout">
    <section class="directory-panel">
      <header class="panel-heading">
        <span class="panel-heading-icon"><AppIcon name="route" :size="16" /></span>
        <div class="panel-heading-copy">
          <h3>{{ t("notifications.rulesTitle") }}</h3>
          <p>{{ t("notifications.rulesPanelHint") }}</p>
        </div>
        <AppIconButton :label="t('notifications.newRule')" @click="resetR">＋</AppIconButton>
      </header>
      <AppScrollArea root-class="panel-scroll" type="auto">
        <div v-if="!rules.length" class="empty-directory">
          <span class="empty-icon"><AppIcon name="route" :size="22" /></span>
          <strong>{{ t("notifications.emptyRules") }}</strong>
          <p>{{ t("notifications.emptyRulesHint") }}</p>
          <AppButton variant="primary" block @click="resetR">{{
            t("notifications.createFirstRule")
          }}</AppButton>
        </div>
        <div
          v-for="item in rules"
          :key="item.id"
          class="directory-item rule-directory-item"
          :class="{ selected: rid === item.id }"
          role="button"
          tabindex="0"
          @click="editR(item)"
          @keydown.enter.prevent="editR(item)"
          @keydown.space.prevent="editR(item)"
        >
          <span class="provider-icon rule-provider"><AppIcon name="route" :size="18" /></span>
          <span class="directory-content"
            ><strong>{{ item.name }}</strong
            ><small>{{ evName(item.eventType, catalog) }} · {{ phaseName(item.phase) }}</small
            ><small>{{ outcomeName(item.outcome) }} · {{ item.channelIds.length }}</small></span
          >
          <span
            class="status-dot"
            :class="{ online: item.enabled }"
            :title="
              item.enabled ? t('notifications.statusEnabled') : t('notifications.statusDisabled')
            "
          ></span>
          <AppIconButton
            class="row-delete"
            size="sm"
            danger
            :label="t('notifications.deleteRuleTitle', { name: item.name })"
            @click.stop="deleteR(item)"
            ><AppIcon name="trash-2" :size="14"
          /></AppIconButton>
        </div>
      </AppScrollArea>
      <footer v-if="rules.length" class="panel-footer">
        <span class="status-dot online"></span>
        {{ t("notifications.rulesActiveCount", { count: enabledRules.length }) }}
      </footer>
    </section>

    <form v-if="ruleEditorOpen" class="editor-panel" @submit.prevent="saveR">
      <header class="editor-heading">
        <div class="editor-title-mark rule-title-mark"><AppIcon name="route" :size="19" /></div>
        <div class="editor-heading-copy">
          <div class="editor-kicker">
            {{ rid ? t("notifications.ruleKickerEdit") : t("notifications.ruleKickerNew") }}
          </div>
          <h3>{{ rid ? t("notifications.ruleEdit") : t("notifications.ruleNew") }}</h3>
          <p>{{ t("notifications.ruleDesc") }}</p>
        </div>
        <span class="status-pill" :class="rule.enabled ? 'pill-enabled' : 'pill-disabled'"
          ><span class="status-dot" :class="{ online: rule.enabled }"></span
          >{{
            rule.enabled ? t("notifications.statusEnabled") : t("notifications.statusDisabled")
          }}</span
        >
      </header>
      <AppScrollArea root-class="editor-scroll" type="auto"
        ><div class="editor-body">
          <section class="form-section">
            <div class="section-title">
              <span>01</span>
              <div>
                <h4>{{ t("notifications.sectionRuleInfo") }}</h4>
                <p>{{ t("notifications.sectionRuleInfoHint") }}</p>
              </div>
            </div>
            <label class="field"
              ><span>{{ t("notifications.fieldRuleName") }} <i>*</i></span
              ><AppInput
                v-model="rule.name"
                required
                maxlength="80"
                :placeholder="t('notifications.placeholderRuleName')"
            /></label>
          </section>
          <section class="form-section">
            <div class="section-title">
              <span>02</span>
              <div>
                <h4>{{ t("notifications.sectionConditions") }}</h4>
                <p>{{ t("notifications.sectionConditionsHint") }}</p>
              </div>
            </div>
            <label class="field"
              ><span>{{ t("notifications.fieldEvent") }}</span
              ><AppSelect
                block
                :model-value="rule.eventType"
                :options="eventOptions"
                @update:model-value="setEvent(String($event))"
            /></label>
            <div class="field-grid">
              <label class="field"
                ><span>{{ t("notifications.fieldPhase") }}</span
                ><AppSelect
                  block
                  :model-value="rule.phase"
                  :options="phaseOptions"
                  @update:model-value="setPhase"
              /></label>
              <label class="field"
                ><span>{{ t("notifications.fieldOutcome") }}</span
                ><AppSelect
                  block
                  :model-value="rule.outcome ?? 'any'"
                  :options="outcomeOptions"
                  @update:model-value="setOutcome"
              /></label>
            </div>
            <div class="condition-hint">
              <AppIcon name="info" :size="16" />
              <div>
                <strong>{{ phaseName(rule.phase) }} · {{ outcomeName(rule.outcome) }}</strong>
                <p>{{ phaseDescription }}</p>
              </div>
            </div>
            <label class="field"
              ><span
                >{{ t("notifications.fieldSubjectType") }}
                <em>{{ t("notifications.optionalCondition") }}</em></span
              ><AppInput
                v-model="rule.subjectType"
                :placeholder="t('notifications.placeholderSubjectType')"
              /><small class="field-hint">{{ t("notifications.hintSubjectType") }}</small></label
            >
          </section>
          <section class="form-section">
            <div class="section-title">
              <span>03</span>
              <div>
                <h4>{{ t("notifications.sectionTargets") }}</h4>
                <p>{{ t("notifications.sectionTargetsHint") }}</p>
              </div>
            </div>
            <div v-if="!channels.length" class="inline-empty">
              <AppIcon name="network" :size="18" />
              <div>
                <strong>{{ t("notifications.noChannelsForRule") }}</strong>
                <p>{{ t("notifications.noChannelsForRuleHint") }}</p>
              </div>
              <AppButton variant="secondary" @click="tab = 'channels'">{{
                t("notifications.goToChannels")
              }}</AppButton>
            </div>
            <div v-else class="channel-options">
              <label
                v-for="item in channels"
                :key="item.id"
                class="channel-option"
                :class="{
                  checked: rule.channelIds.includes(item.id),
                  unavailable: !item.enabled,
                }"
              >
                <AppCheckbox
                  :model-value="rule.channelIds.includes(item.id)"
                  :disabled="!item.enabled && !rule.channelIds.includes(item.id)"
                  :aria-label="item.name"
                  @update:model-value="toggleChannel(item.id, $event)"
                />
                <span class="option-icon"
                  ><AppIcon :name="item.provider === 'dingtalk' ? 'bell-ring' : 'globe'" :size="17"
                /></span>
                <span class="option-copy"
                  ><strong>{{ item.name }}</strong
                  ><small
                    >{{ providerName(item.provider) }} ·
                    {{
                      item.enabled
                        ? t("notifications.statusEnabled")
                        : t("notifications.statusDisabled")
                    }}</small
                  ></span
                >
                <AppIcon
                  v-if="rule.channelIds.includes(item.id)"
                  name="circle-check"
                  :size="17"
                  class="option-check"
                />
              </label>
            </div>
            <small v-if="rule.channelIds.length" class="field-hint">{{
              t("notifications.hintTargetsSummary", {
                count: rule.channelIds.length,
                names: rule.channelIds.map(channelName).join(", "),
              })
            }}</small>
          </section>
          <section class="form-section compact-section">
            <div class="section-title">
              <span>04</span>
              <div>
                <h4>{{ t("notifications.sectionRuleStatus") }}</h4>
                <p>{{ t("notifications.sectionRuleStatusHint") }}</p>
              </div>
            </div>
            <AppToggle
              v-model="rule.enabled"
              :label="t('notifications.toggleRule')"
              :description="t('notifications.toggleRuleHint')"
            />
          </section></div
      ></AppScrollArea>
      <footer class="editor-footer">
        <AppButton variant="secondary" @click="resetR">{{
          t("notifications.buttonNewBlank")
        }}</AppButton>
        <AppButton
          v-if="rid"
          variant="danger-ghost"
          @click="deleteR(rules.find((x) => x.id === rid))"
          ><AppIcon name="trash-2" :size="15" /> {{ t("common.delete") }}</AppButton
        >
        <span class="footer-spacer"></span>
        <AppButton
          type="submit"
          variant="primary"
          :disabled="busy || !rule.name.trim() || !rule.channelIds.length"
          ><AppIcon name="save" :size="15" />
          {{
            busy ? t("notifications.buttonSaving") : t("notifications.buttonSaveRule")
          }}</AppButton
        >
      </footer>
    </form>
    <section v-else class="editor-panel editor-placeholder" aria-live="polite">
      <div class="placeholder-icon"><AppIcon name="file-text" :size="22" /></div>
      <p>{{ t("notifications.selectHint") }}</p>
    </section>
  </section>
</template>
