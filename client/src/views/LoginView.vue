<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { api } from "../api/client";
import AppHeader from "../components/AppHeader.vue";

const router = useRouter();
const password = ref("");
const error = ref("");
const loading = ref(false);

onMounted(async () => {
  try {
    const meta = await api.meta();
    if (!meta.adminEnabled) {
      error.value = "后台未启用：请设置环境变量 ADMIN_PASSWORD";
      return;
    }
    const session = await api.session();
    if (session.loggedIn) {
      await router.replace("/admin");
    }
  } catch {
    /* ignore */
  }
});

async function onSubmit() {
  error.value = "";
  loading.value = true;
  try {
    await api.login(password.value);
    await router.push("/admin");
  } catch (e) {
    error.value = e instanceof Error ? e.message : "登录失败";
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <main class="page">
    <AppHeader brand="genpac-runner" sub="Admin">
      <RouterLink to="/">首页</RouterLink>
      <a href="/proxy.pac" target="_blank" rel="noopener noreferrer">查看 PAC</a>
    </AppHeader>

    <div class="card">
      <div class="icon-badge" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
      </div>
      <h1>后台登录</h1>
      <p class="muted">使用启动时配置的 <code>ADMIN_PASSWORD</code> 登录。</p>
      <div v-if="error" class="alert">{{ error }}</div>
      <form @submit.prevent="onSubmit">
        <label for="pw">密码</label>
        <input
          id="pw"
          v-model="password"
          type="password"
          required
          autocomplete="current-password"
          autofocus
        />
        <button type="submit" class="primary" :disabled="loading">
          {{ loading ? "登录中…" : "登录" }}
        </button>
      </form>
    </div>
  </main>
</template>

<style scoped>
.card {
  max-width: 400px;
  width: 100%;
  margin: min(10vh, 48px) auto 0;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: clamp(20px, 4vw, 28px) clamp(18px, 4vw, 24px);
  box-shadow: var(--shadow);
}
.icon-badge {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  background: var(--accent-soft);
  color: var(--accent);
  margin-bottom: 14px;
}
h1 {
  margin: 0 0 8px;
  font-size: 22px;
}
.muted {
  color: var(--muted);
  margin: 0 0 18px;
  font-size: 14px;
}
label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  margin: 0 0 6px;
}
input {
  width: 100%;
  border: 1px solid var(--line);
  background: var(--bg);
  color: var(--text);
  border-radius: var(--radius-sm);
  padding: 11px 12px;
  margin-bottom: 14px;
}
input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
button {
  width: 100%;
  appearance: none;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--text);
  border-radius: var(--radius-sm);
  min-height: var(--touch);
  padding: 11px 14px;
  font-weight: 600;
  cursor: pointer;
}
button.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}
button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.alert {
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  background: var(--red-soft);
  border: 1px solid color-mix(in srgb, var(--red) 35%, var(--line));
  margin-bottom: 14px;
  font-size: 14px;
}
</style>
