/// <reference types="vite/client" />

/** 构建时由 vite define 注入的应用版本号（来自 package.json，避免整个 JSON 进包）。 */
declare const __APP_VERSION__: string;

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<object, object, unknown>;
  export default component;
}

declare module "cronstrue/locales/zh_CN";
