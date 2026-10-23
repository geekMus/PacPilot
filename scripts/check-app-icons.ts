import fs from "node:fs";
import path from "node:path";

const sourceRoot = path.resolve(import.meta.dir, "../client/src");
const iconComponentPath = path.join(sourceRoot, "components/AppIcon.vue");
const iconComponent = fs.readFileSync(iconComponentPath, "utf8");
const mapMatch = iconComponent.match(/const iconMap = \{([\s\S]*?)\} as const/);

if (!mapMatch) throw new Error("无法读取 AppIcon.vue 中的图标映射表。");

const registeredIcons = new Set(
  [...mapMatch[1].matchAll(/^\s*(?:"([^"]+)"|'([^']+)'|([\w-]+))\s*:/gm)].map(
    (match) => match[1] ?? match[2] ?? match[3]
  )
);
const usedIcons = new Map<string, Set<string>>();
const legacyScrollbarUsages: string[] = [];

function collectSourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(entryPath);
    return /\.vue$/.test(entry.name) ? [entryPath] : [];
  });
}

for (const file of collectSourceFiles(sourceRoot)) {
  const source = fs.readFileSync(file, "utf8");
  if (/<CodeMirrorField\b[^>]*\bscrollbar-mode\s*=\s*["']always["']/s.test(source)) {
    legacyScrollbarUsages.push(path.relative(process.cwd(), file));
  }
  const appIconTags = /<AppIcon\b([^>]*)>/g;
  for (const tag of source.matchAll(appIconTags)) {
    const iconProps = /(?:^|\s):?name\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    for (const match of tag[1].matchAll(iconProps)) {
      const expression = match[1] ?? match[2] ?? "";
      // Check static names and every literal candidate in conditional expressions.
      const names = new Set<string>();
      if (/^[a-z][a-z0-9-]*$/.test(expression)) names.add(expression);
      for (const literal of expression.matchAll(/(?:\?|:)\s*["']([a-z][a-z0-9-]*)["']/g)) {
        names.add(literal[1]);
      }
      for (const name of names) {
        if (!usedIcons.has(name)) usedIcons.set(name, new Set());
        usedIcons.get(name)!.add(path.relative(process.cwd(), file));
      }
    }
  }
}

const missing = [...usedIcons.entries()]
  .filter(([name]) => !registeredIcons.has(name))
  .sort(([a], [b]) => a.localeCompare(b));

if (missing.length) {
  const details = missing
    .map(([name, files]) => `  - ${name}: ${[...files].join(", ")}`)
    .join("\n");
  throw new Error(`发现未注册的 AppIcon 图标名称：\n${details}`);
}

if (legacyScrollbarUsages.length) {
  throw new Error(
    `发现已废弃的 CodeMirrorField scrollbar-mode="always"：\n${legacyScrollbarUsages.join("\n")}`
  );
}

const editorComponent = fs.readFileSync(path.join(sourceRoot, "components/CodeMirrorField.vue"), "utf8");
if (!/scrollbarMode\?:\s*["']hover["']\s*\|\s*["']auto["']/.test(editorComponent)) {
  throw new Error("CodeMirrorField scrollbarMode 应仅支持 hover | auto。");
}
if (!/scrollbarMode:\s*["']auto["']/.test(editorComponent)) {
  throw new Error('CodeMirrorField scrollbarMode 默认值应为 "auto"。');
}

console.log(`AppIcon 检查通过：已验证 ${usedIcons.size} 个静态图标名称；编辑器滚动条模式检查通过。`);
