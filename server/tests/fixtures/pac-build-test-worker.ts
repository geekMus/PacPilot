/**
 * 构建子进程的测试替身。
 *
 * 通过请求里的 `code` 字段切换行为，用来覆盖真实子进程不容易复现的异常分支：
 *
 * - `__empty__`：不输出任何内容直接退出（子进程崩溃或被杀的情形）
 * - `__garbled__`：输出不是 JSON 的内容
 * - `__nocode__`：输出合法 JSON，但没有产物字段
 * - `__failed__`：输出构建失败的报错
 * - 其他：正常返回一段固定产物
 */
const raw = await Bun.stdin.text();
const request = JSON.parse(raw) as { code?: string };

if (request.code === "__empty__") {
  process.exit(0);
}

if (request.code === "__garbled__") {
  await Bun.write(Bun.stdout, "not-json");
  process.exit(0);
}

if (request.code === "__nocode__") {
  await Bun.write(Bun.stdout, JSON.stringify({ ok: true }));
  process.exit(0);
}

if (request.code === "__failed__") {
  await Bun.write(Bun.stdout, JSON.stringify({ ok: false, error: "构建失败" }));
  process.exit(0);
}

await Bun.write(Bun.stdout, JSON.stringify({ ok: true, code: "built" }));
process.exit(0);

export {};
