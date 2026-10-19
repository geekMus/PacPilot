<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter, useRoute } from "vue-router";
import { api } from "../api/client";
import AppHeader from "../components/AppHeader.vue";
import AppFooter from "../components/AppFooter.vue";

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
    </AppHeader>
    <section class="auth-layout">
      <div class="auth-intro">
        <div class="page-kicker">ADMINISTRATION</div>
        <h1 class="page-title">管理你的 PAC 配置</h1>
        <p>登录后可以切换生成模式、维护直连和黑名单、设置定时生成，并管理 Webhook 通知。</p>
        <div class="security-note"><span aria-hidden="true">◈</span><span>首次启动默认管理密码为 <code>password</code>；登录后请立即修改。忘记密码可在容器内运行密码重置命令。</span></div>
      </div>
      <section class="login-card">
        <div class="login-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="25" height="25" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4.5" y="10" width="15" height="11" rx="2.5"/><path d="M8 10V7.5a4 4 0 0 1 8 0V10"/><path d="M12 14v3"/></svg>
        </div>
        <h2>后台登录</h2><p class="login-subtitle">输入管理密码以继续</p>
        <div v-if="notice" class="alert success-alert" role="status">{{ notice }}</div>
        <div v-if="error" class="alert" :class="{ warning: adminEnabled === false }" role="alert">{{ error }}</div>
        <form @submit.prevent="onSubmit">
          <label for="pw">管理密码</label>
          <input id="pw" v-model="password" type="password" required autocomplete="current-password"
            placeholder="输入管理密码" :disabled="adminEnabled === false" autofocus />
          <button type="submit" class="login-submit" :disabled="loading || !password || adminEnabled === false">
            {{ loading ? "正在验证…" : "登录控制台" }}<span v-if="!loading" aria-hidden="true">→</span>
          </button>
        </form>
        <p class="login-footnote">请勿在公共设备上保存管理密码。忘记密码时执行：</p>
        <p class="login-footnote"><code>docker exec -it genpac-runner bun run /app/scripts/reset-admin-password.ts</code></p>
      </section>
    </section>
    <AppFooter />
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
.login-submit { display:flex; align-items:center; justify-content:space-between; width:100%; min-height:44px; padding:0 14px; border:1px solid var(--accent); border-radius:9px; background:var(--accent); color:var(--accent-contrast); font-size:13px; font-weight:650; cursor:pointer; }
.login-submit:hover:not(:disabled),
.login-submit:active:not(:disabled) {
  background: color-mix(in srgb, var(--accent) 90%, var(--text));
  border-color: color-mix(in srgb, var(--accent) 90%, var(--text));
  color: var(--accent-contrast);
}
.login-submit:disabled {
  background: var(--surface-2);
  border-color: var(--line);
  color: var(--muted);
  -webkit-text-fill-color: var(--muted);
  opacity: 1;
  cursor: not-allowed;
}
.login-footnote { margin:14px 0 0; color:var(--muted); font-size:11px; }
.alert { padding:10px 12px; border:1px solid color-mix(in srgb,var(--red) 35%,var(--line)); border-radius:9px; background:var(--red-soft); margin-bottom:14px; font-size:12px; line-height:1.5; }
.alert.warning { border-color:color-mix(in srgb,var(--warn) 35%,var(--line)); background:var(--warn-soft); }
@media(max-width:680px) { .auth-layout { grid-template-columns:1fr; align-content:start; gap:24px; padding-top:12px; } .auth-intro .page-title { max-width:13em; font-size:32px; } .security-note { margin-top:16px; } .login-card { justify-self:stretch; max-width:none; } }
.success-alert { border-color: var(--green); background: var(--green-soft); color: var(--green); }
</style>
