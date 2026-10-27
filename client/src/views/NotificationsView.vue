<script setup lang="ts">
import { defineAsyncComponent, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import AdminLayout from "@/components/layout/AdminLayout.vue";
import AppButton from "@/components/AppButton.vue";
import AppFooter from "@/components/AppFooter.vue";
import AppIcon from "@/components/AppIcon.vue";
import { useNotificationWorkspace } from "@/features/notifications/composables/useNotificationWorkspace";
import NotificationChannelsPanel from "@/features/notifications/components/NotificationChannelsPanel.vue";
import NotificationOverview from "@/features/notifications/components/NotificationOverview.vue";

/**
 * 非默认标签页与投递详情弹窗改按需加载。
 *
 * 它们静态导入时属于视图模块的静态依赖，浏览器必须先下载并执行完整模块图才能挂载
 * 视图；其中历史面板引入虚拟表格、详情弹窗引入弹窗与浮层依赖，把首屏关键路径的
 * 模块链拉长了 2-3 跳。默认标签页与页面骨架保持静态导入，首次绘制不受影响。
 */
const NotificationRulesPanel = defineAsyncComponent(
  () => import("@/features/notifications/components/NotificationRulesPanel.vue")
);
const NotificationHistoryPanel = defineAsyncComponent(
  () => import("@/features/notifications/components/NotificationHistoryPanel.vue")
);
const NotificationDeliveryDialog = defineAsyncComponent(
  () => import("@/features/notifications/components/NotificationDeliveryDialog.vue")
);
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
      <!-- 加载完成前不渲染页脚，避免它先从首屏内被推到折叠线以下而计入 CLS。 -->
      <AppFooter v-if="!loading" />
    </main>
  </AdminLayout>
</template>
