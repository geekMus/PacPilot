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

function collectSourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(entryPath);
    return /\.vue$/.test(entry.name) ? [entryPath] : [];
  });
}

for (const file of collectSourceFiles(sourceRoot)) {
  const source = fs.readFileSync(file, "utf8");
  const iconProps = /(?:^|\s):?name\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  for (const match of source.matchAll(iconProps)) {
    const expression = match[1] ?? match[2] ?? "";
    // Dynamic icon expressions are also checked for each literal string candidate.
    for (const literal of expression.matchAll(/["']([a-z][a-z0-9-]*)["']/g)) {
      const name = literal[1];
      if (!usedIcons.has(name)) usedIcons.set(name, new Set());
      usedIcons.get(name)!.add(path.relative(process.cwd(), file));
    }
  }
}

const missing = [...usedIcons.entries()]
  .filter(([name]) => !registeredIcons.has(name))
  .sort(([a], [b]) => a.localeCompare(b));

if (missing.length) {
  const details = missing
    .map(([name, files]) => `  - ${name}: ${[...files].join(", ")}`)
    .join("\\n");
  throw new Error(`发现未注册的 AppIcon 图标名称：\\n${details}`);
}

console.log(`AppIcon 检查通过：已验证 ${usedIcons.size} 个静态图标名称。`);
