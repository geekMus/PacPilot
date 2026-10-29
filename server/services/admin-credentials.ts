import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { AdminCredentialRecord, AdminCredentialRepository } from "../storage/repositories";
import { t } from "../../shared/i18n";
import type { AppLocale } from "../../shared/i18n/locale";

const HASH_BYTES = 64;
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

type AdminAuthRecord = AdminCredentialRecord;

export type AdminPasswordErrorCode =
  | "current_password_incorrect"
  | "new_password_empty"
  | "new_password_same_as_current"
  | "new_password_too_short";

export class AdminPasswordError extends Error {
  constructor(
    readonly code: AdminPasswordErrorCode,
    message: string
  ) {
    super(message);
    this.name = "AdminPasswordError";
  }
}

async function readRecord(repository: AdminCredentialRepository): Promise<AdminAuthRecord | null> {
  return await repository.get();
}

async function writeRecord(
  repository: AdminCredentialRepository,
  record: AdminAuthRecord
): Promise<void> {
  await repository.set(record);
}

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, HASH_BYTES, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  }).toString("hex");
}

function passwordRecord(password: string, sessionSecret?: string): AdminAuthRecord {
  const salt = randomBytes(16).toString("hex");
  return {
    passwordHash: hashPassword(password, salt),
    salt,
    sessionSecret: sessionSecret || randomBytes(32).toString("base64url"),
  };
}

export async function isAdminCredentialsMissing(
  repository: AdminCredentialRepository
): Promise<boolean> {
  return (await readRecord(repository)) === null;
}

export type InitialCredentialSource = "configured" | "generated";

export interface InitialCredentialResult {
  /** The password that was written; null when credentials already existed. */
  password: string | null;
  /** Where the initial password came from. */
  source: InitialCredentialSource | null;
}

export async function createInitialAdminCredentials(
  repository: AdminCredentialRepository,
  configuredPassword?: string,
  configuredSessionSecret?: string
): Promise<InitialCredentialResult> {
  // 说明：read-then-write 非原子，但本项目为单进程运行，且仅在启动阶段调用一次，
  // 不存在并发竞争窗口；多进程部署需要改为数据库层面的原子 upsert。
  if (await readRecord(repository)) return { password: null, source: null };

  // 完全信任用户输入，不做最小长度限制；空值或纯空白视为未配置，走随机生成。
  const trimmed = configuredPassword?.trim() ?? "";

  const source: InitialCredentialSource = trimmed ? "configured" : "generated";
  const initialPassword = trimmed || randomBytes(18).toString("base64url");
  await writeRecord(repository, passwordRecord(initialPassword, configuredSessionSecret));
  return { password: initialPassword, source };
}

async function getRecord(repository: AdminCredentialRepository): Promise<AdminAuthRecord> {
  const record = await readRecord(repository);
  if (!record) throw new Error("Admin credentials are not initialized.");
  return record;
}

export async function getAdminSessionSecret(
  repository: AdminCredentialRepository
): Promise<string> {
  return (await getRecord(repository)).sessionSecret;
}

export async function verifyAdminPassword(
  repository: AdminCredentialRepository,
  password: string
): Promise<boolean> {
  if (typeof password !== "string" || password.length === 0) return false;
  const record = await readRecord(repository);
  if (!record) return false;
  const actual = Buffer.from(hashPassword(password, record.salt), "hex");
  const expected = Buffer.from(record.passwordHash, "hex");
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}

export async function changeAdminPassword(
  repository: AdminCredentialRepository,
  currentPassword: string,
  newPassword: string,
  locale: AppLocale = "zh_CN"
): Promise<void> {
  if (!(await verifyAdminPassword(repository, currentPassword))) {
    throw new AdminPasswordError("current_password_incorrect", t(locale, "passwordErrors.currentIncorrect"));
  }
  // 完全信任用户输入，不做最小长度限制；仅拒绝空值或纯空白。
  if (typeof newPassword !== "string" || newPassword.trim().length === 0) {
    throw new AdminPasswordError("new_password_empty", t(locale, "passwordErrors.newEmpty"));
  }
  if (newPassword === currentPassword) {
    throw new AdminPasswordError("new_password_same_as_current", t(locale, "passwordErrors.sameAsCurrent"));
  }
  await writeRecord(repository, passwordRecord(newPassword));
}

export async function resetAdminPassword(repository: AdminCredentialRepository): Promise<string> {
  const temporary = randomBytes(18).toString("base64url");
  // 必须等待写入完成：脚本调用方会在拿到密码后立即关闭数据库，
  // 不等待会让写入落在已关闭的连接上而静默丢失。
  await writeRecord(repository, passwordRecord(temporary));
  return temporary;
}
