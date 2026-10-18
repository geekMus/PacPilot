import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "path";

export default defineConfig(({ mode }) => {
  // 读取项目根目录 .env，与后端 PORT 对齐
  const rootEnv = loadEnv(mode, path.resolve(__dirname, ".."), "");
  const apiPort = rootEnv.PORT || process.env.PORT || "17321";
  const apiTarget = `http://127.0.0.1:${apiPort}`;

  return {
    root: path.resolve(__dirname),
    plugins: [vue()],
    base: "/",
    server: {
      port: 5173,
      host: true,
      proxy: {
        "/api": apiTarget,
        "/proxy.pac": apiTarget,
      },
    },
    build: {
      outDir: path.resolve(__dirname, "../dist/client"),
      emptyOutDir: true,
    },
  };
});
