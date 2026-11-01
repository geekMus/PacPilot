import type { ToastKind } from "@/composables/useToast";

/**
 * Toast 运行时（vue-sonner，约 36KB）的唯一入口。
 *
 * 页面加载时不该为一个可能永远不出现的提示付首屏代价：这里按需加载 vue-sonner，
 * 并把「运行时是否就绪」同步给 App.vue，后者据此决定何时挂载 ToastHost。
 * ToastHost 挂载后会补投排队中的提示，先报错后挂载也不会丢消息。
 */
export interface PendingToast {
  message: string;
  kind: ToastKind;
  duration: number;
}

type ToastRuntime = typeof import("vue-sonner");

const pending: PendingToast[] = [];
const listeners = new Set<(loaded: boolean) => void>();
let runtimePromise: Promise<ToastRuntime> | null = null;
let loaded = false;
let hostReady = false;

function publish(): void {
  for (const listener of listeners) listener(loaded);
}

export function subscribeToastRuntime(listener: (loaded: boolean) => void): () => void {
  listeners.add(listener);
  listener(loaded);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * 只解析一次 vue-sonner：并发投递共用同一个模块实例，避免每条提示各触发一次
 * 动态导入（也会让测试里的模块 mock 只生效一次）。
 */
function loadRuntime(): Promise<ToastRuntime> {
  runtimePromise ??= import("vue-sonner").catch((error: unknown) => {
    // 加载失败（离线/资源 404）时允许下次重试，避免 Toast 永久失效。
    runtimePromise = null;
    throw error;
  });
  return runtimePromise;
}

/**
 * 投递一条提示。运行时加载失败时把提示放回队首等待重试，而不是直接丢弃：
 * 提示已经由调用方发出，静默丢掉只会让用户以为操作没生效。
 */
async function deliver(entry: PendingToast): Promise<void> {
  let runtime: ToastRuntime;
  try {
    runtime = await loadRuntime();
  } catch (error) {
    pending.unshift(entry);
    console.error("[toast] 运行时加载失败，提示已保留待重试", error);
    return;
  }
  const { toast } = runtime;
  const options = { duration: entry.duration };
  switch (entry.kind) {
    case "success":
      toast.success(entry.message, options);
      break;
    case "error":
      toast.error(entry.message, options);
      break;
    case "warning":
      toast.warning(entry.message, options);
      break;
    default:
      toast.info(entry.message, options);
  }
}

/** 把排队中的提示投递给已挂载的 Toaster。 */
export function flushPendingToasts(): void {
  while (pending.length > 0) {
    const entry = pending.shift();
    if (entry) void deliver(entry);
  }
}

/** ToastHost 挂载完成：从这里开始，提示可以直接投递。 */
export function markToastHostReady(): void {
  hostReady = true;
  flushPendingToasts();
}

/** 请求加载 vue-sonner（幂等），加载完成后通知订阅者挂载 ToastHost。 */
export function ensureToastRuntime(): Promise<void> {
  return loadRuntime().then(() => {
    if (!loaded) {
      loaded = true;
      publish();
    }
  });
}

/** 由 useToast 调用：先排队，再触发运行时加载；Host 已就绪时立刻投递。 */
export function enqueueToast(entry: PendingToast): void {
  pending.push(entry);
  void ensureToastRuntime()
    .then(() => {
      if (hostReady) flushPendingToasts();
    })
    .catch((error: unknown) => {
      // 提示仍在队列里：加载成功后（Host 挂载或下次投递）会补投，这里只记录原因。
      console.error("[toast] 提示运行时准备失败，提示已保留待重试", error);
    });
}
