<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter, useRoute } from "vue-router";
import { api } from "../api/client";
import AppHeader from "../components/AppHeader.vue";
import AppFooter from "../components/AppFooter.vue";
import AppIcon from "../components/AppIcon.vue";

const router = useRouter();
const route = useRoute();
const password = ref("");
const notice = ref("");
const error = ref("");
const loading = ref(false);
const adminEnabled = ref<boolean | null>(null);

onMounted(async () => {
  if (route.query.passwordChanged === "1") notice.value = "管理密码已修改，请使用新密码登录。";
  try {
    const meta = await api.meta();
    adminEnabled.value = meta.adminEnabled;
    const session = await api.session();
    if (session.loggedIn) await router.replace("/admin/dashboard");
  } catch (e) {
    error.value = e instanceof Error ? e.message : "暂时无法连接服务，请检查后端状态。";
  }
});
async function onSubmit() {
  if (!password.value || loading.value || adminEnabled.value === false) return;
  error.value = "";
  loading.value = true;
  try {
    await api.login(password.value);
    await router.push("/admin/dashboard");
  } catch (e) {
    error.value = e instanceof Error ? e.message : "登录失败，请重试。";
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <main class="page auth-page">
    <AppHeader brand="genpac-runner" sub="安全登录">
      <RouterLink to="/">公共状态页</RouterLink>
    </AppHeader>
    <section class="auth-layout">
      <div class="auth-intro">
        <div class="page-kicker">ADMINISTRATION</div>
        <h1 class="page-title">管理你的 PAC 配置</h1>
        <p>登录后可以切换生成模式、维护直连和黑名单、设置定时生成，并管理 Webhook 通知。</p>
        <div class="security-note"><span class="security-note-icon" aria-hidden="true"><AppIcon name="shield-check" :size="17" /></span><span>首次启动默认管理密码为 <code>password</code>；登录后请立即修改。忘记密码时，可根据 Docker、本机开发或 Linux、macOS、Windows 的生产部署方式执行对应的重置命令。</span></div>
      </div>
      <section class="login-card">
        <div class="login-mark" aria-hidden="true">
          <AppIcon name="lock-keyhole" :size="25" :stroke-width="1.8" />
        </div>
        <h2>后台登录</h2><p class="login-subtitle">输入管理密码以继续</p>
        <div v-if="notice" class="alert success-alert" role="status">{{ notice }}</div>
        <div v-if="error" class="alert" :class="{ warning: adminEnabled === false }" role="alert">{{ error }}</div>
        <form @submit.prevent="onSubmit">
          <label for="pw">管理密码</label>
          <input id="pw" v-model="password" type="password" required autocomplete="current-password"
            placeholder="输入管理密码" :disabled="adminEnabled === false" autofocus />
          <button type="submit" class="login-submit" :class="{ 'is-loading': loading }" :disabled="loading || !password || adminEnabled === false">
            {{ loading ? "正在验证…" : "登录控制台" }}<AppIcon :name="loading ? 'loader-circle' : 'arrow-right'" :class="{ 'icon-spinning': loading }" :size="16" />
          </button>
        </form>
        <p class="login-footnote">请勿在公共设备上保存管理密码。密码重置会生成一次性临时密码，登录后需立即设置新密码。</p>
        <p class="login-footnote"><a href="https://github.com/geekMus/genpac-runner#常见问题" target="_blank" rel="noopener noreferrer">查看跨平台密码重置说明 ↗</a></p>
      </section>
    </section>
    <AppFooter />
  </main>
</template>

<style scoped>
.auth-page { min-height:100dvh; display:flex; flex-direction:column; }
.auth-layout { display:grid; grid-template-columns:minmax(0,1.1fr) minmax(280px,.8fr); align-items:center; gap:clamp(24px,6vw,72px); flex:1; padding:24px 0 56px; }
.auth-intro .page-kicker { color:var(--accent); }
.auth-intro .page-title { max-width:9em; font-size:clamp(30px,5vw,44px); margin:9px 0 16px; }
.auth-intro>p { max-width:32em; color:var(--muted); font-size:15px; line-height:1.7; }
.security-note { display:flex; align-items:flex-start; gap:10px; max-width:34em; margin-top:26px; color:var(--muted); font-size:12px; line-height:1.6; }
.security-note-icon { display:grid; place-items:center; flex:0 0 28px; width:28px; height:28px; border:1px solid color-mix(in srgb,var(--accent) 22%,var(--line)); border-radius:9px; background:var(--accent-soft); color:var(--accent); }
.login-card { width:100%; max-width:390px; justify-self:end; padding:clamp(22px,4vw,30px); background:var(--surface); border:1px solid var(--line); border-radius:var(--radius); box-shadow:var(--shadow); }
.login-mark { display:grid; place-items:center; width:48px; height:48px; border-radius:14px; background:var(--accent-soft); color:var(--accent); margin-bottom:18px; }
.login-card h2 { margin:0; font-size:20px; }
.login-subtitle { margin:5px 0 22px; color:var(--muted); font-size:13px; }
.login-card label { display:block; margin-bottom:7px; font-size:12px; font-weight:650; }
.login-card input { box-sizing:border-box; width:100%; min-height:44px; margin-bottom:13px; padding:10px 12px; border:1px solid var(--line); border-radius:9px; color:var(--text); background:var(--bg); }
.login-card input:focus { outline:none; border-color:var(--accent); box-shadow:0 0 0 3px var(--accent-soft); }
.login-card input:disabled {
  color:var(--control-disabled-text);
  -webkit-text-fill-color:var(--control-disabled-text);
  background:var(--control-disabled-bg);
  border-color:var(--control-disabled-border);
  box-shadow:none;
  cursor:not-allowed;
  opacity:1;
}
.login-card input:disabled::placeholder { color:var(--control-disabled-text); opacity:1; }
.login-submit { display:flex; align-items:center; justify-content:space-between; width:100%; min-height:44px; padding:0 14px; border:1px solid var(--accent); border-radius:9px; background:var(--accent); color:var(--accent-contrast); font-size:13px; font-weight:650; cursor:pointer; }
.login-submit:hover:not(:disabled) { background:var(--accent-hover); border-color:var(--accent-hover); color:var(--accent-contrast); }
.login-submit:active:not(:disabled) { background:var(--accent-active); border-color:var(--accent-active); color:var(--accent-contrast); }
.login-submit:disabled {
  opacity:1;
  color:var(--control-disabled-text);
  -webkit-text-fill-color:var(--control-disabled-text);
  background:var(--control-disabled-bg);
  border-color:var(--control-disabled-border);
  cursor:not-allowed;
}
.login-submit.is-loading:disabled {
  color:var(--accent-contrast);
  -webkit-text-fill-color:var(--accent-contrast);
  background:var(--accent);
  border-color:var(--accent);
  cursor:progress;
}
.icon-spinning { animation: login-icon-spin .9s linear infinite; }
@keyframes login-icon-spin { to { transform:rotate(360deg); } }
.login-footnote { margin:14px 0 0; color:var(--muted); font-size:11px; line-height:1.55; overflow-wrap:anywhere; }
.login-footnote a { color:var(--accent); font-weight:700; text-decoration:none; }
.login-footnote a:hover { text-decoration:underline; }
.alert { padding:10px 12px; border:1px solid color-mix(in srgb,var(--red) 35%,var(--line)); border-radius:9px; background:var(--red-soft); margin-bottom:14px; font-size:12px; line-height:1.5; }
.alert.warning { border-color:color-mix(in srgb,var(--warn) 35%,var(--line)); background:var(--warn-soft); }
@media(max-width:680px) {
  .auth-page {
    width:100%;
    max-width:none;
    margin:0;
    padding:0 18px;
    box-sizing:border-box;
    background:linear-gradient(180deg,var(--accent-soft) 0, var(--bg) 230px);
  }
  .auth-page :deep(.topbar) { gap:10px; margin:0; padding:18px 0 14px; }
  .auth-page :deep(.brand-mark) { width:40px; height:40px; border-radius:13px; }
  .auth-page :deep(.brand-copy .name) { font-size:15px; }
  .auth-page :deep(.brand-copy small) { font-size:9px; letter-spacing:.1em; }
  .auth-layout { display:flex; flex-direction:column; align-items:stretch; justify-content:flex-start; gap:0; flex:1; padding:clamp(26px,8vh,64px) 0 28px; }
  .auth-intro { display:none; }
  .login-card { width:100%; max-width:440px; align-self:center; justify-self:stretch; padding:26px 22px 22px; border:1px solid color-mix(in srgb,var(--accent) 13%,var(--line)); border-radius:20px; box-shadow:0 16px 44px color-mix(in srgb,var(--text) 8%,transparent); }
  .login-mark { width:52px; height:52px; margin:0 auto 18px; border-radius:16px; }
  .login-card h2 { text-align:center; font-size:22px; letter-spacing:-.025em; }
  .login-subtitle { margin:7px 0 24px; text-align:center; font-size:13px; }
  .login-card label { margin-bottom:9px; font-size:13px; }
  .login-card input { min-height:50px; margin-bottom:16px; padding:12px 14px; border-radius:11px; font-size:16px; }
  .login-submit { min-height:50px; padding:0 16px; border-radius:11px; font-size:14px; }
  .login-footnote { margin-top:15px; font-size:11px; line-height:1.65; }
  .login-footnote + .login-footnote { text-align:center; }
  .auth-page :deep(.app-footer) { margin-top:20px; padding:14px 0 18px; }
}
@media(max-width:380px) {
  .auth-page { padding:0 13px; }
  .login-card { padding:23px 17px 19px; border-radius:17px; }
  .auth-layout { padding-top:clamp(20px,5vh,38px); }
}
.success-alert { border-color: var(--green); background: var(--green-soft); color: var(--green); }
</style>
