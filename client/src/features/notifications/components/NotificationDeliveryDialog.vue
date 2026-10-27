<script setup lang="ts">
import { useI18n } from "vue-i18n";
import AppButton from "@/components/AppButton.vue";
import AppDialog from "@/components/AppDialog.vue";
import AppIcon from "@/components/AppIcon.vue";
import type { NotificationWorkspace } from "@/features/notifications/composables/useNotificationWorkspace";

const props = defineProps<{ ws: NotificationWorkspace }>();
const { t } = useI18n();
const {
  selectedDelivery,
  deliveryDetailOpen,
  deliveryEvent,
  deliveryEventLabel,
  channelName,
  ruleNameById,
  phaseName,
  outcomeName,
  statusName,
  formatDate,
  retry,
} = props.ws;
</script>

<template>
  <AppDialog
    :open="deliveryDetailOpen && !!selectedDelivery"
    :label="t('notifications.dialogTitle')"
    width="min(720px, calc(100vw - 16px))"
    @update:open="deliveryDetailOpen = $event"
  >
    <template #header>
      <div>
        <p class="dialog-eyebrow">
          {{ t("notifications.dialogEyebrow") }}
          {{ selectedDelivery ? String(selectedDelivery.id).slice(0, 8) : "" }}
        </p>
        <h2 class="dialog-title">{{ t("notifications.dialogTitle") }}</h2>
        <p class="dialog-sub">
          {{ selectedDelivery ? channelName(selectedDelivery.channelId) : "" }}
        </p>
      </div>
    </template>
    <template #body>
      <div v-if="selectedDelivery" class="record-detail">
        <div class="record-detail-grid">
          <div>
            <span>{{ t("notifications.columnStatus") }}</span
            ><strong>{{ statusName(selectedDelivery.status) }}</strong>
          </div>
          <div>
            <span>{{ t("notifications.columnChannel") }}</span
            ><strong>{{ channelName(selectedDelivery.channelId) }}</strong>
          </div>
          <div>
            <span>{{ t("notifications.dialogRule") }}</span
            ><strong>{{ ruleNameById(selectedDelivery.ruleId) }}</strong>
          </div>
          <div>
            <span>{{ t("notifications.dialogEvent") }}</span
            ><strong>{{ deliveryEventLabel(selectedDelivery) }}</strong>
          </div>
          <div>
            <span>{{ t("notifications.dialogPhase") }}</span
            ><strong>{{
              deliveryEvent(selectedDelivery)
                ? phaseName(deliveryEvent(selectedDelivery)!.phase)
                : "—"
            }}</strong>
          </div>
          <div>
            <span>{{ t("notifications.dialogOutcome") }}</span
            ><strong>{{
              deliveryEvent(selectedDelivery)
                ? outcomeName(deliveryEvent(selectedDelivery)!.outcome)
                : "—"
            }}</strong>
          </div>
          <div>
            <span>{{ t("notifications.dialogCreatedAt") }}</span
            ><strong>{{ formatDate(selectedDelivery.createdAt) }}</strong>
          </div>
          <div>
            <span>{{ t("notifications.dialogUpdatedAt") }}</span
            ><strong>{{ formatDate(selectedDelivery.updatedAt) }}</strong>
          </div>
          <div>
            <span>{{ t("notifications.dialogDeliveredAt") }}</span
            ><strong>{{
              selectedDelivery.deliveredAt ? formatDate(selectedDelivery.deliveredAt) : "—"
            }}</strong>
          </div>
          <div>
            <span>{{ t("notifications.columnAttempts") }}</span
            ><strong>{{ selectedDelivery.attemptCount }}</strong>
          </div>
        </div>
        <section class="record-detail-block">
          <h3>{{ t("notifications.dialogSummarySection") }}</h3>
          <p>
            {{ deliveryEvent(selectedDelivery)?.summary || t("notifications.dialogNoSummary") }}
          </p>
        </section>
        <section class="record-detail-block record-detail-error">
          <h3>{{ t("notifications.dialogErrorSection") }}</h3>
          <pre v-if="selectedDelivery.lastError">{{ selectedDelivery.lastError }}</pre>
          <p v-else>{{ t("notifications.dialogNoError") }}</p>
        </section>
        <div v-if="selectedDelivery.status === 'failed'" class="record-detail-actions">
          <AppButton variant="secondary" @click="retry(selectedDelivery.id)"
            ><AppIcon name="refresh-cw" :size="14" /> {{ t("notifications.retry") }}</AppButton
          >
        </div>
      </div>
    </template>
  </AppDialog>
</template>
