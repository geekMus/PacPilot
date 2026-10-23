import { computed, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { api, ApiError } from "@/api/client";
import { useToast } from "@/composables/useToast";

export function useAdminPassword() {
  const { t } = useI18n();
  const { notify } = useToast();
  const router = useRouter();
  const passwordSaving = ref(false);
  const passwordErrorKey = ref<"settings.enterCurrentPassword" | "settings.passwordMismatch" | "settings.passwordSameAsCurrent" | "settings.currentPasswordIncorrect" | "settings.newPasswordEmpty" | "">("");
  const passwordErrorDetail = ref("");
  const passwordError = computed({
    get: () => passwordErrorKey.value ? t(passwordErrorKey.value) : passwordErrorDetail.value,
    set: (message: string) => { passwordErrorKey.value = ""; passwordErrorDetail.value = message; },
  });
  const passwordForm = reactive({ currentPassword: "", newPassword: "", confirmPassword: "" });
  function passwordErrorKeyFromCode(code: string): typeof passwordErrorKey.value {
    if (code === "current_password_incorrect") return "settings.currentPasswordIncorrect";
    if (code === "new_password_empty") return "settings.newPasswordEmpty";
    if (code === "new_password_same_as_current") return "settings.passwordSameAsCurrent";
    return "";
  }
  function passwordErrorKeyFromMessage(message: string): typeof passwordErrorKey.value {
    if (message === "当前管理密码不正确。") return "settings.currentPasswordIncorrect";
    if (message === "新密码不能为空。") return "settings.newPasswordEmpty";
    if (message === "新密码不能与当前密码相同。") return "settings.passwordSameAsCurrent";
    return "";
  }
  async function changeAdminPassword(): Promise<void> {
    passwordError.value = "";
    if (!passwordForm.currentPassword) { passwordErrorKey.value = "settings.enterCurrentPassword"; return; }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) { passwordErrorKey.value = "settings.passwordMismatch"; return; }
    if (passwordForm.newPassword === passwordForm.currentPassword) { passwordErrorKey.value = "settings.passwordSameAsCurrent"; return; }
    passwordSaving.value = true;
    try {
      await api.changePassword({ currentPassword: passwordForm.currentPassword, newPassword: passwordForm.newPassword });
      const { invalidateAdminSessionCache } = await import("@/composables/useAdminSession");
      invalidateAdminSessionCache();
      notify(t("settings.passwordChangedOk"), "success");
      await router.replace({ path: "/admin/login", query: { passwordChanged: "1" } });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "";
      const key = (caught instanceof ApiError && passwordErrorKeyFromCode(caught.code)) || passwordErrorKeyFromMessage(message);
      if (key) passwordErrorKey.value = key;
      else passwordError.value = message || t("settings.passwordChangeFailed");
    } finally { passwordSaving.value = false; }
  }
  return { passwordSaving, passwordError, passwordForm, changeAdminPassword };
}
