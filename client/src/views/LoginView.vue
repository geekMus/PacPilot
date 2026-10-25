<script setup lang="ts">
import { computed, nextTick, ref, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter, useRoute } from "vue-router";
import { api, ApiError } from "@/api/client";
import AppHeader from "@/components/AppHeader.vue";
import AppFooter from "@/components/AppFooter.vue";
import AppIcon from "@/components/AppIcon.vue";
import AppInput from "@/components/AppInput.vue";
import { useToast } from "@/composables/useToast";
import { fetchAdminSession, invalidateAdminSessionCache } from "@/composables/useAdminSession";
import { PROJECT_LINKS } from "@shared/project-links";
const { t } = useI18n();
const { notify } = useToast();

const router = useRouter();
const route = useRoute();

/**
 * 被路由守卫踢到登录页时会带上 `redirect`，登录成功后要回到原地址。
 * 只接受站内 `/admin/` 开头的路径，避免被构造成外部跳转。
 */
const redirectTarget = computed(() => {
  const raw = route.query.redirect;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") return "/admin/dashboard";
  if (!value.startsWith("/admin/")) return "/admin/dashboard";
  return value;
});
const password = ref("");
const passwordInput = ref<InstanceType<typeof AppInput> | null>(null);
const notice = computed(() =>
  route.query.passwordChanged === "1" ? t("login.passwordChanged") : ""
);
const errorKey = ref<"login.connectFailed" | "login.invalidPassword" | "login.loginFailed" | "">(
  ""
);
const errorDetail = ref("");
const error = computed(() => (errorKey.value ? t(errorKey.value) : errorDetail.value));
const loading = ref(false);
const adminCredentialsMissing = ref(false);

onMounted(async () => {
  let shouldFocus = true;
  try {
    const session = await api.session();
    if (session.adminCredentialsMissing) {
      adminCredentialsMissing.value = true;
      shouldFocus = false;
    } else if (session.loggedIn) {
      shouldFocus = false;
      await router.replace(redirectTarget.value);
    }
  } catch (e) {
    if (e instanceof Error) errorDetail.value = e.message;
    else errorKey.value = "login.connectFailed";
  } finally {
    if (shouldFocus && !adminCredentialsMissing.value) {
      await nextTick();
      passwordInput.value?.focus();
    }
  }
});
async function onSubmit() {
  if (!password.value || loading.value) return;
  errorKey.value = "";
  errorDetail.value = "";
  loading.value = true;
  try {
    await api.login(password.value);
    invalidateAdminSessionCache();
    await fetchAdminSession(true);
    notify(t("login.success"), "success");
    await router.push(redirectTarget.value);
  } catch (e) {
    const code = e instanceof ApiError ? e.code : "";
    const message = e instanceof Error ? e.message : "";
    if (code === "invalid_password") errorKey.value = "login.invalidPassword";
    else if (!message) errorKey.value = "login.loginFailed";
    else errorDetail.value = message;
    notify(error.value, "error");
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <main class="page auth-page">
    <AppHeader brand="PacPilot" :sub="t('login.secureLogin')">
      <RouterLink to="/">{{ t("nav.publicStatus") }}</RouterLink>
    </AppHeader>
    <section class="auth-layout">
      <div class="auth-intro">
        <div class="page-kicker">{{ t("login.kicker") }}</div>
        <h1 class="page-title">{{ t("login.pageTitle") }}</h1>
        <p>{{ t("login.pageDesc") }}</p>
        <div class="security-note">
          <span class="security-note-icon" aria-hidden="true"
            ><AppIcon name="shield-check" :size="17" /></span
          ><span>{{ t("login.securityNote") }}</span>
        </div>
      </div>
      <section class="login-card">
        <div class="login-mark" aria-hidden="true">
          <AppIcon name="lock-keyhole" :size="25" :stroke-width="1.8" />
        </div>
        <h2>{{ t("login.backendLogin") }}</h2>
        <p class="login-subtitle">{{ t("login.enterPassword") }}</p>
        <div v-if="adminCredentialsMissing" class="alert" role="status">
          {{ t("login.adminCredentialsMissing") }}
        </div>
        <div v-if="notice" class="alert success-alert" role="status">{{ notice }}</div>
        <div v-if="error" class="alert" role="alert">
          {{ error }}
        </div>
        <form @submit.prevent="onSubmit">
          <label for="pw">{{ t("login.password") }}</label>
          <AppInput
            id="pw"
            ref="passwordInput"
            v-model="password"
            type="password"
            required
            autocomplete="current-password"
            :placeholder="t('login.passwordPlaceholder')"
            :disabled="adminCredentialsMissing"
          />
          <button
            type="submit"
            class="login-submit"
            :class="{ 'is-loading': loading }"
            :disabled="loading || !password || adminCredentialsMissing"
            :title="
              loading
                ? t('login.verifying')
                : !password
                  ? t('login.needPassword')
                  : t('login.titleButton')
            "
          >
            {{ loading ? t("login.submitting") : t("login.submit")
            }}<AppIcon
              :name="loading ? 'loader-circle' : 'arrow-right'"
              :class="{ 'icon-spinning': loading }"
              :size="16"
            />
          </button>
        </form>
        <p class="login-footnote">{{ t("login.footnote") }}</p>
        <p class="login-footnote">
          <a :href="PROJECT_LINKS.adminPasswordReset" target="_blank" rel="noopener noreferrer">{{
            t("login.resetHelp")
          }}</a>
        </p>
      </section>
    </section>
    <AppFooter />
  </main>
</template>

<style scoped>
@reference "@/styles/tailwind.css";

.auth-page {
  @apply flex min-h-dvh flex-col;
}
.auth-layout {
  @apply grid flex-1 items-center gap-[clamp(24px,6vw,72px)] px-0 pt-6 pb-14;
  grid-template-columns: minmax(0, 1.1fr) minmax(280px, 0.8fr);
}
.auth-intro .page-kicker {
  color: var(--accent);
}
.auth-intro .page-title {
  @apply mb-4 mt-[9px] text-[clamp(30px,5vw,44px)];
  max-width: 9em;
}
.auth-intro > p {
  @apply max-w-[32em] text-[15px] leading-[1.7];
  color: var(--muted);
}
.security-note {
  @apply mt-[26px] flex max-w-[34em] items-start gap-2.5 text-xs leading-normal;
  color: var(--muted);
}
.security-note-icon {
  @apply grid h-7 w-7 shrink-0 place-items-center rounded-[9px] border;
  border-color: color-mix(in srgb, var(--accent) 22%, var(--line));
  background: var(--accent-soft);
  color: var(--accent);
}
.login-card {
  @apply w-full max-w-[390px] justify-self-end p-[clamp(22px,4vw,30px)] rounded-[var(--radius)] border;
  background: var(--surface);
  border-color: var(--line);
  box-shadow: var(--shadow);
}
.login-mark {
  @apply mb-[18px] grid h-12 w-12 place-items-center rounded-[14px];
  background: var(--accent-soft);
  color: var(--accent);
}
.login-card h2 {
  @apply m-0 text-xl;
}
.login-subtitle {
  @apply mb-[22px] mt-[5px] text-[13px];
  color: var(--muted);
}
.login-card label {
  @apply mb-[7px] block text-xs font-semibold;
}
.login-card .app-input {
  @apply mb-[13px] min-h-11 rounded-[9px];
}
.login-card .app-input:disabled {
  -webkit-text-fill-color: var(--control-disabled-text);
  box-shadow: none;
  opacity: 1;
}
.login-card .app-input:disabled::placeholder {
  color: var(--control-disabled-text);
  opacity: 1;
}
.login-submit {
  @apply flex w-full items-center justify-between rounded-[9px] border px-[14px] text-[13px] font-semibold cursor-pointer;
  min-height: 44px;
  border-color: var(--accent);
  background: var(--accent);
  color: var(--accent-contrast);
}
.login-submit:hover:not(:disabled) {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
  color: var(--accent-contrast);
}
.login-submit:active:not(:disabled) {
  background: var(--accent-active);
  border-color: var(--accent-active);
  color: var(--accent-contrast);
}
.login-submit:disabled {
  @apply cursor-not-allowed opacity-100;
  color: var(--control-disabled-text);
  -webkit-text-fill-color: var(--control-disabled-text);
  background: var(--control-disabled-bg);
  border-color: var(--control-disabled-border);
}
.login-submit.is-loading:disabled {
  @apply cursor-progress;
  color: var(--accent-contrast);
  -webkit-text-fill-color: var(--accent-contrast);
  background: var(--accent);
  border-color: var(--accent);
}
.icon-spinning {
  animation: login-icon-spin 0.9s linear infinite;
}
@keyframes login-icon-spin {
  to {
    transform: rotate(360deg);
  }
}
.login-footnote {
  @apply mt-3.5 text-[11px] leading-normal;
  color: var(--muted);
  overflow-wrap: anywhere;
}
.login-footnote a {
  @apply font-bold no-underline;
  color: var(--accent);
}
.login-footnote a:hover {
  @apply underline;
}
.alert {
  @apply mb-3.5 rounded-[9px] border p-2.5 text-xs leading-normal;
  border-color: color-mix(in srgb, var(--red) 35%, var(--line));
  background: var(--red-soft);
}
.alert.warning {
  border-color: color-mix(in srgb, var(--warn) 35%, var(--line));
  background: var(--warn-soft);
}
.success-alert {
  border-color: var(--green);
  background: var(--green-soft);
  color: var(--green);
}
@media (max-width: 680px) {
  .auth-page {
    @apply mx-0 w-full max-w-none box-border px-[18px];
    background: linear-gradient(180deg, var(--accent-soft) 0, var(--bg) 230px);
  }
  .auth-page :deep(.topbar) {
    @apply m-0 gap-2.5 px-0 pt-[18px] pb-3.5;
  }
  .auth-page :deep(.brand-mark) {
    @apply h-10 w-10 rounded-[13px];
  }
  .auth-page :deep(.brand-copy .name) {
    @apply text-[15px];
  }
  .auth-page :deep(.brand-copy small) {
    @apply text-[9px] tracking-[0.1em];
  }
  .auth-layout {
    @apply flex flex-1 flex-col items-stretch justify-start gap-0 px-0 pt-[clamp(26px,8vh,64px)] pb-7;
  }
  .auth-intro {
    @apply hidden;
  }
  .login-card {
    @apply w-full max-w-[440px] self-center justify-self-stretch rounded-[20px] border px-[22px] pt-[26px] pb-[22px];
    border-color: color-mix(in srgb, var(--accent) 13%, var(--line));
    box-shadow: 0 16px 44px color-mix(in srgb, var(--text) 8%, transparent);
  }
  .login-mark {
    @apply mx-auto mb-[18px] h-[52px] w-[52px] rounded-2xl;
  }
  .login-card h2 {
    @apply text-center text-[22px] tracking-tight;
  }
  .login-subtitle {
    @apply mb-6 mt-[7px] text-center text-[13px];
  }
  .login-card label {
    @apply mb-[9px] text-[13px];
  }
  .login-card .app-input {
    @apply mb-4 min-h-[50px] rounded-[11px] px-[14px] py-3 text-base;
  }
  .login-submit {
    @apply min-h-[50px] rounded-[11px] px-4 text-sm;
  }
  .login-footnote {
    @apply mt-[15px] text-[11px] leading-relaxed;
  }
  .login-footnote + .login-footnote {
    @apply text-center;
  }
  .auth-page :deep(.app-footer) {
    @apply mt-5 px-0 pt-3.5 pb-[18px];
  }
}
@media (max-width: 380px) {
  .auth-page {
    @apply px-[13px];
  }
  .login-card {
    @apply rounded-[17px] px-[17px] pt-[23px] pb-[19px];
  }
  .auth-layout {
    @apply pt-[clamp(20px,5vh,38px)];
  }
}
</style>
