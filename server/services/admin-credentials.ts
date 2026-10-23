import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { AdminCredentialRecord, AdminCredentialRepository } from "../storage/repositories";

const HASH_BYTES = 64;
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

type AdminAuthRecord = AdminCredentialRecord;

export type AdminPasswordErrorCode =
  "current_password_incorrect" | "new_password_empty" | "new_password_same_as_current";

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

export async function createInitialAdminCredentials(
  repository: AdminCredentialRepository,
  configuredPassword?: string,
  configuredSessionSecret?: string
): Promise<string | null> {
  if (await readRecord(repository)) return null;
  const initialPassword = configuredPassword || randomBytes(18).toString("base64url");
  await writeRecord(repository, passwordRecord(initialPassword, configuredSessionSecret));
  return initialPassword;
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
  newPassword: string
): Promise<void> {
  if (!(await verifyAdminPassword(repository, currentPassword))) {
    throw new AdminPasswordError("current_password_incorrect", "当前管理密码不正确。");
  }
  if (typeof newPassword !== "string" || newPassword.length === 0) {
    throw new AdminPasswordError("new_password_empty", "新密码不能为空。");
  }
  if (newPassword === currentPassword) {
    throw new AdminPasswordError("new_password_same_as_current", "新密码不能与当前密码相同。");
  }
  await writeRecord(repository, passwordRecord(newPassword));
}

export function resetAdminPassword(repository: AdminCredentialRepository): string {
  const temporary = randomBytes(18).toString("base64url");
  writeRecord(repository, passwordRecord(temporary));
  return temporary;
}
