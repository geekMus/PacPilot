import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { readFileSync } from "node:fs";

export default defineConfig(({ mode }) => {
  // 读取项目根目录 .env，与后端 PORT 对齐
  const rootEnv = loadEnv(mode, path.resolve(import.meta.dirname, ".."), "");
  const apiPort = rootEnv.PORT || process.env.PORT || "17321";
  const apiTarget = `http://127.0.0.1:${apiPort}`;
  // 版本号在构建期注入为常量；客户端运行时导入整个 package.json 会把脚本与
  // 依赖清单（约 100KB）打进产物（见 AppFooter 的历史问题）。
  const pkg = JSON.parse(
    readFileSync(path.resolve(import.meta.dirname, "../package.json"), "utf8")
  ) as { version: string };

  return {
    root: path.resolve(import.meta.dirname),
    // 不注入 Vue DevTools overlay/inspector，避免额外运行时开销影响开发时浏览器响应。
    plugins: [vue(), tailwindcss()],
    base: "/",
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
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
        // 后端不再产出 PAC 文件，/pac 由后端实时渲染；开发时转发到后端端口。
        "/api": apiTarget,
        "/pac": apiTarget,
      },
    },
    build: {
      // 将构建产物的体积警告阈值设为 600 kB；此设置只调整警告阈值，不会自动拆分代码块。
      chunkSizeWarningLimit: 600,
      outDir: path.resolve(import.meta.dirname, "../dist/client"),
      emptyOutDir: true,
      // 服务端按路由把视图块的 <link rel=modulepreload> 注入 index.html，
      // 少了它每个页面都要等入口脚本执行完才知道去下载哪个视图块（多一次往返）。
      manifest: true,
      rollupOptions: {
        output: {
          // 首屏请求数同样关键：服务端走 HTTP/1.1，每个小 chunk 都要占一条连接并各付
          // 一次往返延迟。共享组件被拆成十几个 1-4KB 的小块时，慢网下最后一个模块要
          // 200ms 才到（实测 logs 27 个请求 vs dashboard 20 个），Lighthouse 会按 4 倍
          // 放大成 0.3s 的 FCP/LCP 差距。把小于 30KB 的块并入相邻块可以显著减少请求数。
          experimentalMinChunkSize: 30_000,
          // cron 解析（cron-parser 传递依赖 luxon，合计约 100KB）只在生成配置页的
          // 定时预览里使用；单独分包，避免混进全站共享块导致每个页面都要下载。
          manualChunks(id: string) {
            if (id.includes("node_modules")) {
              if (/[\\/](cron-parser|luxon|cronstrue)[\\/]/.test(id)) return "cron";
            }
          },
        },
      },
    },
  };
});
