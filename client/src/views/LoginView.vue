<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter, useRoute } from "vue-router";
import { api } from "../api/client";
import AppHeader from "../components/AppHeader.vue";
import AppFooter from "../components/AppFooter.vue";
import AppIcon from "../components/AppIcon.vue";
import { useToast } from "../composables/useToast";


const { t } = useI18n();
const { notify } = useToast();

const router = useRouter();
const route = useRoute();
const password = ref("");
const notice = ref("");
const error = ref("");
const loading = ref(false);
const adminEnabled = ref<boolean | null>(null);

onMounted(async () => {
  if (route.query.passwordChanged === "1") notice.value = t("login.passwordChanged");
  try {
    const meta = await api.meta();
    adminEnabled.value = meta.adminEnabled;
    const session = await api.session();
    if (session.loggedIn) await router.replace("/admin/dashboard");
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("login.connectFailed");
  }
});
async function onSubmit() {
  if (!password.value || loading.value || adminEnabled.value === false) return;
  error.value = "";
  loading.value = true;
  try {
    await api.login(password.value);
    const { invalidateAdminSessionCache, fetchAdminSession } = await import(
      "../composables/useAdminSession"
    );
    invalidateAdminSessionCache();
    const session = await fetchAdminSession(true);
    notify(t("login.success"), "success");
    if (session.mustChangePassword) {
      notify(t("login.stillDefaultPassword"), "warning", 5500);
      await router.push("/admin/settings");
    } else {
      await router.push("/admin/dashboard");
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("login.loginFailed");
    notify(error.value, "error");
  } finally {
    loading.value = false;
  }
}
</script>