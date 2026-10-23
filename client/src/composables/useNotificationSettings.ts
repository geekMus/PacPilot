import { computed, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { api, type AppSettings, type WebhookConfig } from "@/api/client";
import { createAdminSettingsValidators } from "@/utils/admin-settings-validation";
import { useToast } from "@/composables/useToast";

type NotificationChannel = "success" | "failure";

function defaultWebhookConfig(): WebhookConfig {
  return { provider: "custom", url: "", method: "POST", headers: "{}", body: "", dingTalkSecret: "", dingTalkMessageType: "text", testBody: JSON.stringify({ ok: "{{ok}}", event: "{{event}}", message: "{{message}}", timestamp: "{{timestamp}}" }, null, 2), messageTemplate: "", testMessageTemplate: "" };
}
function normalizeWebhookConfig(value: WebhookConfig | undefined): WebhookConfig {
  return { ...defaultWebhookConfig(), ...value, testBody: value?.testBody ?? defaultWebhookConfig().testBody, messageTemplate: value?.messageTemplate ?? "", testMessageTemplate: value?.testMessageTemplate ?? "" };
}

export function useNotificationSettings() {
  const { t } = useI18n();
  const { notify } = useToast();
  const router = useRouter();
  const validators = createAdminSettingsValidators(t);
  const loading = ref(true);
  const saving = ref(false);
  const error = ref("");
  const settings = ref<AppSettings | null>(null);
  const channels = reactive({ success: defaultWebhookConfig(), failure: defaultWebhookConfig() });
  const testState = reactive({ success: { pending: false, ok: null as boolean | null, message: "" }, failure: { pending: false, ok: null as boolean | null, message: "" } });
  const validation = computed(() => ({ success: validators.validateWebhookDraft(channels.success, t("settings.successChannel")), failure: validators.validateWebhookDraft(channels.failure, t("settings.failureChannel")) }));
  const validationMessages = computed(() => ({ success: validators.webhookErrorMessages(validation.value.success), failure: validators.webhookErrorMessages(validation.value.failure) }));
  async function load(): Promise<void> {
    loading.value = true; error.value = "";
    try {
      const session = await api.session();
      if (!session.loggedIn) { await router.replace("/admin/login"); return; }
      const current = await api.settings();
      settings.value = current;
      channels.success = normalizeWebhookConfig(current.webhookSuccessConfig);
      channels.failure = normalizeWebhookConfig(current.webhookFailureConfig);
    } catch (caught) { error.value = caught instanceof Error ? caught.message : String(caught); }
    finally { loading.value = false; }
  }
  async function save(): Promise<void> {
    if (saving.value || !settings.value) return;
    const issues = [...validationMessages.value.success, ...validationMessages.value.failure];
    if (issues.length) { notify(issues.join("\n"), "error"); return; }
    saving.value = true;
    try {
      const latest = await api.settings();
      const saved = await api.saveSettings({ ...latest, webhookSuccessConfig: { ...channels.success }, webhookFailureConfig: { ...channels.failure } });
      settings.value = saved;
      channels.success = normalizeWebhookConfig(saved.webhookSuccessConfig);
      channels.failure = normalizeWebhookConfig(saved.webhookFailureConfig);
      notify(t("notifications.saved"), "success");
    } catch (caught) { notify(caught instanceof Error ? caught.message : String(caught), "error"); }
    finally { saving.value = false; }
  }
  async function test(channel: NotificationChannel): Promise<void> {
    const state = testState[channel], config = channels[channel];
    state.message = ""; state.ok = null;
    if (!config.url.trim()) { state.ok = false; state.message = t("settings.webhookNeedTarget"); return; }
    const issues = validators.webhookErrorMessages(validators.validateWebhookDraft(config, t(channel === "success" ? "settings.successChannel" : "settings.failureChannel")));
    if (issues.length) { state.ok = false; state.message = issues.join("\n"); return; }
    state.pending = true;
    try {
      const result = await api.testWebhook({ config: { ...config } });
      state.ok = result.success;
      state.message = result.success ? t("settings.webhookTestAccepted", { status: result.status ?? t("common.unknown") }) : result.status ? t("settings.webhookTestFailed", { detail: `${result.message} (HTTP ${result.status})` }) : t("settings.webhookTestFailed", { detail: result.message });
      notify(state.message, result.success ? "success" : "error");
    } catch (caught) { state.ok = false; state.message = caught instanceof Error ? caught.message : String(caught); notify(state.message, "error"); }
    finally { state.pending = false; }
  }
  onMounted(() => void load());
  return { t, loading, saving, error, channels, testState, validation, validationMessages, load, save, test };
}
