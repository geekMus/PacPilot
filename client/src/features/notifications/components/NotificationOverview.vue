<script setup lang="ts">
import { useI18n } from "vue-i18n";
import AppIcon from "@/components/AppIcon.vue";
import type { NotificationWorkspace } from "@/features/notifications/composables/useNotificationWorkspace";

const props = defineProps<{ ws: NotificationWorkspace }>();
const { t } = useI18n();
const { channels, enabledChannels, rules, enabledRules, pendingDeliveries, failedDeliveries } =
  props.ws;
</script>

<template>
  <section class="page-intro">
    <div class="intro-copy">
      <div class="eyebrow">
        <AppIcon name="workflow" :size="14" /> {{ t("notifications.eventDriven") }}
      </div>
      <h2>{{ t("notifications.workspace") }}</h2>
      <p>{{ t("notifications.workspaceHint") }}</p>
    </div>
    <div class="intro-state">
      <span
        class="state-dot"
        :class="{ online: enabledChannels.length > 0 && enabledRules.length > 0 }"
      ></span>
      <div>
        <strong>{{
          enabledChannels.length && enabledRules.length
            ? t("notifications.stateReady")
            : t("notifications.stateSetup")
        }}</strong
        ><small>{{ t("notifications.stateHint") }}</small>
      </div>
    </div>
  </section>

  <section class="overview-grid" :aria-label="t('notifications.workspace')">
    <article class="overview-card">
      <div class="overview-top">
        <span class="overview-icon channel-icon"><AppIcon name="network" :size="18" /></span>
        <div class="overview-value">
          {{ enabledChannels.length }}<span> / {{ channels.length }}</span>
        </div>
      </div>
      <div class="overview-label">{{ t("notifications.overviewChannels") }}</div>
      <div class="overview-foot">{{ t("notifications.overviewChannelsHint") }}</div>
    </article>
    <article class="overview-card">
      <div class="overview-top">
        <span class="overview-icon rule-icon"><AppIcon name="route" :size="18" /></span>
        <div class="overview-value">
          {{ enabledRules.length }}<span> / {{ rules.length }}</span>
        </div>
      </div>
      <div class="overview-label">{{ t("notifications.overviewRules") }}</div>
      <div class="overview-foot">{{ t("notifications.overviewRulesHint") }}</div>
    </article>
    <article class="overview-card">
      <div class="overview-top">
        <span class="overview-icon delivery-icon"><AppIcon name="activity" :size="18" /></span>
        <div class="overview-value">{{ pendingDeliveries.length }}</div>
      </div>
      <div class="overview-label">{{ t("notifications.overviewPending") }}</div>
      <div class="overview-foot">{{ t("notifications.overviewPendingHint") }}</div>
    </article>
    <article class="overview-card" :class="{ 'has-failures': failedDeliveries.length > 0 }">
      <div class="overview-top">
        <span class="overview-icon failure-icon"><AppIcon name="circle-alert" :size="18" /></span>
        <div class="overview-value">{{ failedDeliveries.length }}</div>
      </div>
      <div class="overview-label">{{ t("notifications.overviewFailed") }}</div>
      <div class="overview-foot">
        {{
          failedDeliveries.length
            ? t("notifications.overviewFailedHint")
            : t("notifications.overviewFailedNone")
        }}
      </div>
    </article>
  </section>
</template>
