import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";
import vueDevTools from "vite-plugin-vue-devtools";
import path from "path";

export default defineConfig(({ mode, command }) => {
  // 读取项目根目录 .env，与后端 PORT 对齐
  const rootEnv = loadEnv(mode, path.resolve(import.meta.dirname, ".."), "");
  const apiPort = rootEnv.PORT || process.env.PORT || "17321";
  const apiTarget = `http://127.0.0.1:${apiPort}`;

  return {
    root: path.resolve(import.meta.dirname),
    // Vue DevTools is registered only for the Vite dev server; production builds never include it.
    plugins: command === "serve" ? [vueDevTools(), vue()] : [vue()],
    base: "/",
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "src"),
        "@shared": path.resolve(import.meta.dirname, "../shared"),
      },
    },
    server: {
      port: 5173,
      host: true,
      proxy: {
        "/api": apiTarget,
        "/proxy.pac": apiTarget,
      },
    },
    build: {
      // 将构建产物的体积警告阈值设为 600 kB；此设置只调整警告阈值，不会自动拆分代码块。
      chunkSizeWarningLimit: 600,
      outDir: path.resolve(import.meta.dirname, "../dist/client"),
      emptyOutDir: true,
    },
  };
});
