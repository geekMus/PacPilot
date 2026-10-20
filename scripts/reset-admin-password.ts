import fs from "node:fs";
import path from "node:path";
import { loadEnv } from "../server/config/env";
import { closeDb, getDb } from "../server/db/sqlite";
import { resetAdminPassword } from "../server/services/admin-credentials";

type RuntimeProfile = "development" | "production";

function printUsage(): void {
  console.log(
    [
      "genpac-runner 管理员凭据创建 / 密码重置",
      "",
      "用法：",
      "  bun run reset:admin-password",
      "  bun run reset:admin-password:development",
      "  bun run reset:admin-password:production",
      '  bun run scripts/reset-admin-password.ts --production --data-dir "/absolute/path/to/data"',
      "",
      "参数：",
      "  首次启动后运行此命令，可为新数据库创建管理员凭据并生成一次性临时密码。",
      "  --development   使用本机开发配置（读取开发环境 .env）",
      "  --production    使用非容器生产环境的默认数据目录规则",
      "  --data-dir PATH 显式指定数据库所在的数据目录（目录内必须已有 genpac.db）",
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
  process.env.GENPAC_ENV = selectedProfile;
  process.env.NODE_ENV = selectedProfile;
}

try {
  const env = loadEnv();
  // 使用与服务一致的 DATA_DIR/平台默认路径；显式参数优先级最高。
  const dataDir = explicitDataDir ? path.resolve(explicitDataDir) : env.dataDir;
  const databasePath = path.join(dataDir, "genpac.db");

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
    const temporaryPassword = resetAdminPassword(database);
    console.log("管理员凭据已创建或重置。下面的随机临时密码只显示这一次：");
    console.log("");
    console.log(temporaryPassword);
    console.log("");
    console.log("运行模式：" + env.runtimeProfile);
    console.log("数据目录：" + dataDir);
    console.log("数据库文件：" + databasePath);
    console.log(
      "请使用临时密码登录后台，并立即设置自己的新密码。完成修改前，其他管理操作会被锁定。"
    );
  } finally {
    closeDb();
  }
} catch (caught) {
  console.error("管理员密码重置失败：", caught instanceof Error ? caught.message : String(caught));
  process.exitCode = 1;
} finally {
  closeDb();
}
