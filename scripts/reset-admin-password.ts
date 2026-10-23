import fs from "node:fs";
import path from "node:path";
import { loadEnv } from "../server/config/env";
import { closeDb, getDb } from "../server/storage/sqlite/database";
import { resetAdminPassword } from "../server/services/admin-credentials";
import { SqliteAdminCredentialRepository } from "../server/storage/sqlite/credentials";
import { asAsyncRepository } from "../server/storage/async-repository";

type RuntimeProfile = "development" | "production";

function printUsage(): void {
  console.log(
    [
      "PacPilot 管理员凭据创建 / 密码重置",
      "",
      "用法：",
      "  bun run reset:admin-password",
      "  bun run reset:admin-password:development",
      "  bun run reset:admin-password:production",
      '  bun run scripts/reset-admin-password.ts --production --data-dir "/absolute/path/to/data"',
      "",
      "参数：",
      "  新数据库首次启动会自动生成密码并将其写入日志；此命令用于重置已有凭据。",
      "  --development   使用本机开发配置（读取开发环境 .env）",
      "  --production    使用非容器生产环境的默认数据目录规则",
      "  --data-dir PATH 显式指定数据库所在的数据目录（目录内必须已有 database.db）",
      "  --help           显示此帮助",
      "",
      "Docker 容器内仍可运行：",
      "  bun run /app/scripts/reset-admin-password.ts",
    ].join("\n")
  );
}

const args = process.argv.slice(2);
let selectedProfile: RuntimeProfile | null = null;
let explicitDataDir: string | null = null;

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === "--help" || arg === "-h") {
    printUsage();
    process.exit(0);
  }
  if (arg === "--development" || arg === "--production") {
    const nextProfile = arg === "--development" ? "development" : "production";
    if (selectedProfile && selectedProfile !== nextProfile) {
      console.error("不能同时使用 --development 和 --production。");
      process.exit(2);
    }
    selectedProfile = nextProfile;
    continue;
  }
  if (arg === "--data-dir") {
    const next = args[i + 1];
    if (!next || next.startsWith("--")) {
      console.error("--data-dir 后必须提供数据目录路径。");
      process.exit(2);
    }
    explicitDataDir = next;
    i += 1;
    continue;
  }
  if (arg.startsWith("--data-dir=")) {
    explicitDataDir = arg.slice("--data-dir=".length);
    if (!explicitDataDir) {
      console.error("--data-dir 后必须提供数据目录路径。");
      process.exit(2);
    }
    continue;
  }
  console.error("未知参数：" + arg);
  printUsage();
  process.exit(2);
}

if (selectedProfile) {
  // 显式选择与服务启动器相同的配置解析模式。Docker 的 /data 仍优先于此模式。
  process.env.PACPILOT_ENV = selectedProfile;
  process.env.NODE_ENV = selectedProfile;
}

try {
  const env = loadEnv();
  // 使用与服务一致的 DATA_DIR/平台默认路径；显式参数优先级最高。
  const dataDir = explicitDataDir ? path.resolve(explicitDataDir) : env.dataDir;
  const databasePath = path.join(dataDir, "database.db");

  // 避免路径不正确时通过 getDb() 新建另一份数据库并误报重置成功。
  if (!fs.existsSync(databasePath)) {
    throw new Error(
      "未找到现有数据库：" +
        databasePath +
        "\n为避免误重置到新建的空数据库，操作已取消。" +
        "\n请确认工作目录、DATA_DIR 或 --data-dir 与运行中的服务一致。"
    );
  }

  const database = getDb(dataDir);
  try {
    const generatedPassword = resetAdminPassword(
      asAsyncRepository(new SqliteAdminCredentialRepository(database))
    );
    console.log("管理员凭据已创建或重置。下面的随机密码只显示这一次：");
    console.log("");
    console.log(generatedPassword);
    console.log("");
    console.log("运行模式：" + env.runtimeProfile);
    console.log("数据目录：" + dataDir);
    console.log("数据库文件：" + databasePath);
    console.log("请使用随机密码登录后台。你可以自行决定是否在后台设置中修改密码。");
  } finally {
    closeDb();
  }
} catch (caught) {
  console.error("管理员密码重置失败：", caught instanceof Error ? caught.message : String(caught));
  process.exitCode = 1;
} finally {
  closeDb();
}
