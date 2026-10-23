<script setup lang="ts">
import { defineAsyncComponent } from "vue";
import AdminLayout from "@/components/layout/AdminLayout.vue";
import AppIcon from "@/components/AppIcon.vue";
import AppFooter from "@/components/AppFooter.vue";
import { useNotificationSettings } from "@/composables/useNotificationSettings";

const WebhookChannelEditor = defineAsyncComponent(() => import("@/features/webhooks/components/WebhookChannelEditor.vue"));
const { t, loading, saving, error, channels, testState, validation, validationMessages, save, test } = useNotificationSettings();
</script>

<template>
  <AdminLayout active="notifications" :title="t('nav.notifications')" :subtitle="t('notifications.subtitle')">
    <div class="notification-page">
      <section v-if="loading" class="state-card" aria-live="polite"><span class="spinner" aria-hidden="true"></span><div><strong>{{ t("common.loading") }}</strong></div></section>
      <section v-else-if="error" class="state-card is-error" role="alert"><AppIcon name="circle-alert" :size="18" /><p>{{ error }}</p></section>
      <template v-else>
        <section class="notification-intro">
          <span class="notification-icon"><AppIcon name="zap" :size="20" /></span>
          <div><h2>{{ t("notifications.channelsTitle") }}</h2><p>{{ t("notifications.channelsDescription") }}</p></div>
          <button class="notification-save" type="button" :disabled="saving" @click="save"><AppIcon :name="saving ? 'loader-circle' : 'save'" :size="15" />{{ saving ? t("common.saving") : t("common.save") }}</button>
        </section>
        <div class="webhook-grid">
          <WebhookChannelEditor :title="t('settings.successNotify')" kind="success" :model-value="channels.success" :pending="testState.success.pending" :result-message="testState.success.message" :result-ok="testState.success.ok" :validation-errors="validation.success" @update:model-value="channels.success = $event" @test="test('success')" />
          <WebhookChannelEditor :title="t('settings.failureNotify')" kind="failure" :model-value="channels.failure" :pending="testState.failure.pending" :result-message="testState.failure.message" :result-ok="testState.failure.ok" :validation-errors="validation.failure" @update:model-value="channels.failure = $event" @test="test('failure')" />
        </div>
        <div v-if="validationMessages.success.length || validationMessages.failure.length" class="notification-validation" role="status"><strong>{{ t("settings.fixBeforeSave") }}</strong><ul><li v-for="message in [...validationMessages.success, ...validationMessages.failure]" :key="message">{{ message }}</li></ul></div>
        <div class="notification-actions"><button class="notification-save" type="button" :disabled="saving" @click="save"><AppIcon :name="saving ? 'loader-circle' : 'save'" :size="15" />{{ saving ? t("common.saving") : t("common.save") }}</button></div>
      </template>
      <AppFooter />
    </div>
  </AdminLayout>
</template>

<style scoped>
.notification-page { display: grid; gap: 20px; }
.notification-intro { display: flex; align-items: center; gap: 14px; padding: 20px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); }
.notification-icon { display: grid; place-items: center; width: 42px; height: 42px; flex: 0 0 42px; border-radius: 11px; color: var(--accent); background: var(--accent-soft); }
.notification-intro h2 { margin: 0; font-size: 16px; }
.notification-intro p { margin: 5px 0 0; color: var(--muted); font-size: 12px; line-height: 1.6; }
.notification-save { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 40px; padding: 0 15px; border: 1px solid var(--accent); border-radius: 9px; color: white; background: var(--accent); font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; }
.notification-save:disabled { opacity: .65; cursor: progress; }
.webhook-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; }
.notification-validation { padding: 14px 18px; border: 1px solid var(--red); border-radius: 10px; color: var(--red); background: var(--red-soft); font-size: 12px; }
.notification-validation ul { margin: 8px 0 0; padding-left: 20px; }
.notification-actions { display: flex; justify-content: flex-end; }
.state-card { display: flex; align-items: center; gap: 12px; padding: 20px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); }
.state-card p { margin: 0; }
.state-card.is-error { color: var(--red); }
.spinner { width: 18px; height: 18px; border: 2px solid var(--line); border-top-color: var(--accent); border-radius: 50%; animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 850px) { .webhook-grid { grid-template-columns: minmax(0, 1fr); } .notification-intro { align-items: flex-start; flex-wrap: wrap; } .notification-intro > div { flex: 1 1 calc(100% - 60px); } .notification-intro > button { margin-left: auto; } }
</style>
