import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { AppDatabase } from "../db/sqlite";

const AUTH_KEY = "admin-auth";
const HASH_BYTES = 64;
/** Explicit scrypt cost (kept explicit for auditability). */
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

interface AdminAuthRecord {
  passwordHash: string;
  salt: string;
  sessionSecret: string;
}

export type AdminPasswordErrorCode =
  | "current_password_incorrect"
  | "new_password_empty"
  | "new_password_same_as_current";

export class AdminPasswordError extends Error {
  constructor(
    readonly code: AdminPasswordErrorCode,
    message: string
  ) {
    super(message);
    this.name = "AdminPasswordError";
  }
}

function readRecord(database: AppDatabase): AdminAuthRecord | null {
  const row = database.query("SELECT value FROM settings WHERE key = ?").get(AUTH_KEY) as {
    value: string;
  } | null;
  if (!row) return null;
  try {
    const v = JSON.parse(row.value) as Partial<AdminAuthRecord>;
    if (
      typeof v.passwordHash === "string" &&
      typeof v.salt === "string" &&
      typeof v.sessionSecret === "string"
    ) {
      return {
        passwordHash: v.passwordHash,
        salt: v.salt,
        sessionSecret: v.sessionSecret,
      };
    }
  } catch {
    /* ignore malformed row */
  }
  return null;
}

function writeRecord(database: AppDatabase, record: AdminAuthRecord): void {
  database
    .query(
      "INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value"
    )
    .run(AUTH_KEY, JSON.stringify(record));
}

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, HASH_BYTES, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  }).toString("hex");
}

function passwordRecord(password: string): AdminAuthRecord {
  const salt = randomBytes(16).toString("hex");
  return {
    passwordHash: hashPassword(password, salt),
    salt,
    // Rotating the session secret invalidates every existing admin cookie.
    sessionSecret: randomBytes(32).toString("base64url"),
  };
}

export function isAdminCredentialsMissing(database: AppDatabase): boolean {
  return readRecord(database) === null;
}

export function createInitialAdminCredentials(database: AppDatabase): string | null {
  return database.transaction(() => {
    if (readRecord(database)) return null;

    const initialPassword = randomBytes(18).toString("base64url");
    writeRecord(database, passwordRecord(initialPassword));
    return initialPassword;
  })();
}

function getRecord(database: AppDatabase): AdminAuthRecord {
  const record = readRecord(database);
  if (!record) throw new Error("Admin credentials are not initialized.");
  return record;
}

export function getAdminSessionSecret(database: AppDatabase): string {
  return getRecord(database).sessionSecret;
}

export function verifyAdminPassword(database: AppDatabase, password: string): boolean {
  if (typeof password !== "string" || password.length === 0) return false;
  const record = readRecord(database);
  if (!record) return false;
  const actual = Buffer.from(hashPassword(password, record.salt), "hex");
  const expected = Buffer.from(record.passwordHash, "hex");
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}

export function changeAdminPassword(
  database: AppDatabase,
  currentPassword: string,
  newPassword: string
): void {
  if (!verifyAdminPassword(database, currentPassword)) {
    throw new AdminPasswordError("current_password_incorrect", "当前管理密码不正确。");
  }
  if (typeof newPassword !== "string" || newPassword.length === 0) {
    throw new AdminPasswordError("new_password_empty", "新密码不能为空。");
  }
  if (newPassword === currentPassword) {
    throw new AdminPasswordError("new_password_same_as_current", "新密码不能与当前密码相同。");
  }
  writeRecord(database, passwordRecord(newPassword));
}

export function resetAdminPassword(database: AppDatabase): string {
  const temporary = randomBytes(18).toString("base64url");
  writeRecord(database, passwordRecord(temporary));
  return temporary;
}
