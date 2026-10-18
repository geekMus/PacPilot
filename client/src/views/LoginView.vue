<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { api } from "../api/client";
import AppHeader from "../components/AppHeader.vue";

const router = useRouter();
const password = ref("");
const error = ref("");
const loading = ref(false);
const adminEnabled = ref<boolean | null>(null);

onMounted(async () => {
  try {
    const meta = await api.meta();
    adminEnabled.value = meta.adminEnabled;
    if (!meta.adminEnabled) {
      error.value = "后台尚未启用，请在服务端设置 ADMIN_PASSWORD。";
      return;
    }
    const session = await api.session();
    if (session.loggedIn) await router.replace("/admin");
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
    await router.push("/admin");
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
      <RouterLink to="/">运行概览</RouterLink>
      <a href="/proxy.pac" target="_blank" rel="noopener noreferrer">查看 PAC</a>
    </AppHeader>
    <section class="auth-layout">
      <div class="auth-intro">
        <div class="page-kicker">ADMINISTRATION</div>
        <h1 class="page-title">管理你的 PAC 配置</h1>
        <p>登录后可以切换生成模式、维护直连和黑名单、设置定时生成，并管理 Webhook 通知。</p>
        <div class="security-note"><span aria-hidden="true">◈</span><span>使用部署时配置的 <code>ADMIN_PASSWORD</code>。密码只用于验证，不会显示在页面上。</span></div>
      </div>
      <section class="login-card">
        <div class="login-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="25" height="25" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4.5" y="10" width="15" height="11" rx="2.5"/><path d="M8 10V7.5a4 4 0 0 1 8 0V10"/><path d="M12 14v3"/></svg>
        </div>
        <h2>后台登录</h2><p class="login-subtitle">输入管理密码以继续</p>
        <div v-if="error" class="alert" :class="{ warning: adminEnabled === false }" role="alert">{{ error }}</div>
        <form @submit.prevent="onSubmit">
          <label for="pw">管理密码</label>
          <input id="pw" v-model="password" type="password" required autocomplete="current-password"
            placeholder="输入 ADMIN_PASSWORD" :disabled="adminEnabled === false" autofocus />
          <button type="submit" class="login-submit" :disabled="loading || !password || adminEnabled === false">
            {{ loading ? "正在验证…" : "登录控制台" }}<span v-if="!loading" aria-hidden="true">→</span>
          </button>
        </form>
        <p class="login-footnote">请勿在公共设备上保存管理密码。</p>
      </section>
    </section>
  </main>
</template>

<style scoped>
.auth-page { min-height:calc(100dvh - 60px); display:flex; flex-direction:column; }
.auth-layout { display:grid; grid-template-columns:minmax(0,1.1fr) minmax(280px,.8fr); align-items:center; gap:clamp(24px,6vw,72px); flex:1; padding:24px 0 56px; }
.auth-intro .page-kicker { color:var(--accent); }
.auth-intro .page-title { max-width:9em; font-size:clamp(30px,5vw,44px); margin:9px 0 16px; }
.auth-intro>p { max-width:32em; color:var(--muted); font-size:15px; line-height:1.7; }
.security-note { display:flex; align-items:flex-start; gap:10px; max-width:34em; margin-top:26px; color:var(--muted); font-size:12px; line-height:1.6; }
.security-note>span:first-child { color:var(--accent); font-size:17px; line-height:1; }
.login-card { width:100%; max-width:390px; justify-self:end; padding:clamp(22px,4vw,30px); background:var(--surface); border:1px solid var(--line); border-radius:var(--radius); box-shadow:var(--shadow); }
.login-mark { display:grid; place-items:center; width:48px; height:48px; border-radius:14px; background:var(--accent-soft); color:var(--accent); margin-bottom:18px; }
.login-card h2 { margin:0; font-size:20px; }
.login-subtitle { margin:5px 0 22px; color:var(--muted); font-size:13px; }
.login-card label { display:block; margin-bottom:7px; font-size:12px; font-weight:650; }
.login-card input { box-sizing:border-box; width:100%; min-height:44px; margin-bottom:13px; padding:10px 12px; border:1px solid var(--line); border-radius:9px; color:var(--text); background:var(--bg); }
.login-card input:focus { outline:none; border-color:var(--accent); box-shadow:0 0 0 3px var(--accent-soft); }
.login-submit { display:flex; align-items:center; justify-content:space-between; width:100%; min-height:44px; padding:0 14px; border:1px solid var(--accent); border-radius:9px; background:var(--accent); color:white; font-size:13px; font-weight:650; cursor:pointer; }
.login-submit:disabled { opacity:.5; cursor:not-allowed; }
.login-footnote { margin:14px 0 0; color:var(--muted); font-size:11px; }
.alert { padding:10px 12px; border:1px solid color-mix(in srgb,var(--red) 35%,var(--line)); border-radius:9px; background:var(--red-soft); margin-bottom:14px; font-size:12px; line-height:1.5; }
.alert.warning { border-color:color-mix(in srgb,var(--warn) 35%,var(--line)); background:var(--warn-soft); }
@media(max-width:680px) { .auth-layout { grid-template-columns:1fr; align-content:start; gap:24px; padding-top:12px; } .auth-intro .page-title { max-width:13em; font-size:32px; } .security-note { margin-top:16px; } .login-card { justify-self:stretch; max-width:none; } }
</style>
