<script setup lang="ts">
import { useI18n } from "vue-i18n";
import AppButton from "@/components/AppButton.vue";
import AppIcon from "@/components/AppIcon.vue";
import AppSelect from "@/components/AppSelect.vue";
import VirtualTable from "@/components/VirtualTable.vue";
import type { NotificationWorkspace } from "@/features/notifications/composables/useNotificationWorkspace";

const props = defineProps<{ ws: NotificationWorkspace }>();
const { t } = useI18n();
const {
  deliveries,
  filteredDeliveries,
  deliveryFilter,
  statusFilterOptions,
  setDeliveryFilter,
  channelName,
  deliveryEventLabel,
  formatDate,
  statusIcon,
  statusName,
  openDeliveryDetails,
  retry,
} = props.ws;
</script>

<template>
  <section class="history-workspace">
    <section class="history-panel">
      <header class="panel-heading">
        <span class="panel-heading-icon"><AppIcon name="bell-ring" :size="16" /></span>
        <div class="panel-heading-copy">
          <h3>{{ t("notifications.recordsTitle") }}</h3>
          <p>{{ t("notifications.recordsHint") }}</p>
        </div>
        <span class="neutral-count">{{
          t("notifications.eventsCount", { count: filteredDeliveries.length })
        }}</span>
        <AppSelect
          class="records-filter"
          :model-value="deliveryFilter"
          :options="statusFilterOptions"
          @update:model-value="setDeliveryFilter"
        />
      </header>
      <div class="records-body">
        <VirtualTable
          :items="filteredDeliveries"
          item-key="id"
          :col-span="6"
          :row-height="56"
          height="100%"
          fixed-height
          min-width="880px"
          table-class="records-table"
          :empty-text="
            deliveries.length ? t('notifications.recordsNoMatch') : t('notifications.emptyRecords')
          "
          :load-more="() => {}"
        >
          <template #columns>
            <col style="width: 128px" />
            <col style="width: 200px" />
            <col style="width: 220px" />
            <col style="width: 180px" />
            <col style="width: 100px" />
            <col style="width: 110px" />
          </template>
          <template #header>
            <tr>
              <th>{{ t("notifications.columnStatus") }}</th>
              <th>{{ t("notifications.columnChannel") }}</th>
              <th>{{ t("notifications.columnEvent") }}</th>
              <th>{{ t("notifications.columnTime") }}</th>
              <th>{{ t("notifications.columnAttempts") }}</th>
              <th>{{ t("notifications.columnActions") }}</th>
            </tr>
          </template>
          <template #row="{ item }">
            <tr
              class="record-row"
              tabindex="0"
              role="button"
              :title="t('notifications.rowOpenHint')"
              @click="openDeliveryDetails(item)"
              @keydown.enter.prevent="openDeliveryDetails(item)"
              @keydown.space.prevent="openDeliveryDetails(item)"
            >
              <td>
                <span class="status-pill small-pill" :class="'delivery-pill-' + item.status"
                  ><AppIcon :name="statusIcon(item.status)" :size="13" />{{
                    statusName(item.status)
                  }}</span
                >
              </td>
              <td class="cell-strong">{{ channelName(item.channelId) }}</td>
              <td class="cell-muted">{{ deliveryEventLabel(item) }}</td>
              <td class="cell-muted nowrap">{{ formatDate(item.updatedAt) }}</td>
              <td class="cell-muted">{{ item.attemptCount }}</td>
              <td>
                <AppButton
                  v-if="item.status === 'failed'"
                  size="sm"
                  variant="secondary"
                  @click.stop="retry(item.id)"
                  ><AppIcon name="refresh-cw" :size="13" />
                  {{ t("notifications.retry") }}</AppButton
                >
                <span v-else class="row-open-hint">{{ t("notifications.rowOpenHint") }}</span>
              </td>
            </tr>
          </template>
        </VirtualTable>
      </div>
    </section>
  </section>
</template>
