import { closeDb, getDb } from "../server/db/sqlite";
import { resetAdminPassword } from "../server/services/admin-credentials";
const database = getDb("/data");
try {
 const temporaryPassword = resetAdminPassword(database);
 console.log("管理员密码已重置。下面的随机临时密码只显示这一次：");
 console.log(""); console.log(temporaryPassword); console.log("");
 console.log("请使用临时密码登录后台，并立即设置自己的新密码。完成修改前，其他管理操作会被锁定。");
} finally { closeDb(); }
