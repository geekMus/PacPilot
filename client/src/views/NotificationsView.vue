<script setup lang="ts">
import { onMounted } from "vue";
import { useI18n } from "vue-i18n";
import AdminLayout from "@/components/layout/AdminLayout.vue";
import AppButton from "@/components/AppButton.vue";
import AppFooter from "@/components/AppFooter.vue";
import AppIcon from "@/components/AppIcon.vue";
import { useNotificationWorkspace } from "@/features/notifications/composables/useNotificationWorkspace";
import NotificationChannelsPanel from "@/features/notifications/components/NotificationChannelsPanel.vue";
import NotificationDeliveryDialog from "@/features/notifications/components/NotificationDeliveryDialog.vue";
import NotificationHistoryPanel from "@/features/notifications/components/NotificationHistoryPanel.vue";
import NotificationOverview from "@/features/notifications/components/NotificationOverview.vue";
import NotificationRulesPanel from "@/features/notifications/components/NotificationRulesPanel.vue";
import "@/features/notifications/styles/notifications-shell.css";
import "@/features/notifications/styles/notifications-editor.css";
import "@/features/notifications/styles/notifications-overview.css";
import "@/features/notifications/styles/notifications-dialog.css";

const { t } = useI18n();
const ws = useNotificationWorkspace();
const { loading, error, tab, channels, rules, deliveries, failedDeliveries, load } = ws;

onMounted(() => {
  void load();
});
</script>

<template>
  <AdminLayout
    active="notifications"
    :title="t('nav.notifications')"
    :subtitle="t('notifications.subtitle')"
  >
    <main class="webhook-page">
      <NotificationOverview :ws="ws" />

      <p v-if="loading" class="state-panel">
        <AppIcon name="loader-circle" :size="18" class="spin" /> {{ t("notifications.loading") }}
      </p>
      <section v-else-if="error" class="state-panel state-error">
        <AppIcon name="circle-alert" :size="20" />
        <div>
          <strong>{{ t("notifications.loadFailed") }}</strong>
          <p>{{ error }}</p>
        </div>
        <AppButton variant="secondary" @click="load()">{{ t("common.retry") }}</AppButton>
      </section>
      <template v-else>
        <section class="workspace-region">
          <nav class="workspace-tabs" :aria-label="t('notifications.workspace')">
            <button :class="{ active: tab === 'channels' }" @click="tab = 'channels'">
              <AppIcon name="network" :size="16" /> {{ t("notifications.tabChannels") }}
              <span class="tab-count">{{ channels.length }}</span>
            </button>
            <button :class="{ active: tab === 'rules' }" @click="tab = 'rules'">
              <AppIcon name="route" :size="16" /> {{ t("notifications.tabRules") }}
              <span class="tab-count">{{ rules.length }}</span>
            </button>
            <button :class="{ active: tab === 'history' }" @click="tab = 'history'">
              <AppIcon name="activity" :size="16" /> {{ t("notifications.tabRecords") }}
              <span class="tab-count">{{ deliveries.length }}</span>
              <span v-if="failedDeliveries.length" class="tab-alert">{{
                failedDeliveries.length
              }}</span>
            </button>
          </nav>

          <NotificationChannelsPanel v-if="tab === 'channels'" :ws="ws" />
          <NotificationRulesPanel v-else-if="tab === 'rules'" :ws="ws" />
          <NotificationHistoryPanel v-else :ws="ws" />

          <NotificationDeliveryDialog :ws="ws" />
        </section>
      </template>
      <AppFooter />
    </main>
  </AdminLayout>
</template>
