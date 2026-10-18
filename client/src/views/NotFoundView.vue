<script setup lang="ts">
import AppHeader from "../components/AppHeader.vue";
</script>

<template>
  <main class="page">
    <AppHeader brand="genpac-runner" sub="404">
      <RouterLink to="/">首页</RouterLink>
      <a href="/proxy.pac">PAC</a>
      <RouterLink to="/admin">后台</RouterLink>
    </AppHeader>

    <section class="panel">
      <p class="code">404</p>
      <h1>页面不存在</h1>
      <p class="desc">当前只提供首页、PAC 下载与后台管理。请从下方入口继续。</p>
      <div class="links">
        <RouterLink class="btn primary" to="/">返回首页</RouterLink>
        <a class="btn" href="/proxy.pac">打开 PAC</a>
        <RouterLink class="btn" to="/admin">后台管理</RouterLink>
      </div>
    </section>
  </main>
</template>

<style scoped>
.panel {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: clamp(24px, 5vw, 40px);
  box-shadow: var(--shadow);
  text-align: center;
  max-width: 480px;
  margin: 8vh auto 0;
}

.code {
  margin: 0;
  font-size: 3rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  color: var(--accent);
  line-height: 1;
}

h1 {
  margin: 12px 0 8px;
  font-size: 1.35rem;
}

.desc {
  margin: 0 auto 22px;
  color: var(--muted);
  max-width: 28em;
  font-size: 0.95rem;
}

.links {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: center;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: var(--touch);
  padding: 0 16px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--line);
  background: var(--surface-2);
  color: var(--text);
  font-weight: 600;
  text-decoration: none;
}

.btn.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.btn:hover {
  text-decoration: none;
  filter: brightness(1.03);
}
</style>
