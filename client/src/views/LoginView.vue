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
  <main class="wrap">
    <AppHeader brand="genpac-runner" sub="ADMIN">
      <RouterLink to="/status">规则状态</RouterLink>
      <a href="/proxy.pac">PAC 原文 ↗</a>
    </AppHeader>

    <div class="card login-card">
      <h1>后台登录</h1>
      <p class="muted">使用环境变量 <code>ADMIN_PASSWORD</code> 设置的密码登录。</p>
      <div v-if="error" class="alert">{{ error }}</div>
      <form @submit.prevent="onSubmit">
        <label>密码</label>
        <input
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
.wrap {
  width: min(960px, calc(100% - 28px));
  margin: 28px auto 48px;
}
.card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 18px;
  box-shadow: var(--shadow);
}
.login-card {
  max-width: 420px;
  margin: 8vh auto 0;
}
h1 {
  margin: 0 0 8px;
  font-size: 24px;
}
.muted {
  color: var(--muted);
  margin: 0 0 16px;
}
label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  margin: 12px 0 6px;
}
input {
  width: 100%;
  border: 1px solid var(--line);
  background: var(--bg);
  color: var(--text);
  border-radius: 10px;
  padding: 10px 12px;
}
button {
  margin-top: 16px;
  width: 100%;
  appearance: none;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--text);
  border-radius: 10px;
  padding: 10px 14px;
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
  padding: 12px 14px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--red) 12%, var(--surface));
  border: 1px solid color-mix(in srgb, var(--red) 35%, var(--line));
  margin-bottom: 14px;
  color: var(--text);
}
</style>
