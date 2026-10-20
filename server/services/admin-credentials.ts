import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { AppDatabase } from "../db/sqlite";

const AUTH_KEY = "admin-auth";
const DEFAULT_PASSWORD = "password";
const HASH_BYTES = 64;
/** Explicit scrypt cost (kept explicit for auditability). */
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

export interface AdminSecurityStatus {
  isDefaultPassword: boolean;
  mustChangePassword: boolean;
}

interface AdminAuthRecord extends AdminSecurityStatus {
  passwordHash: string;
  salt: string;
  sessionSecret: string;
}

function readRecord(database: AppDatabase): AdminAuthRecord | null {
  const row = database
    .query("SELECT value FROM settings WHERE key = ?")
    .get(AUTH_KEY) as { value: string } | null;
  if (!row) return null;
  try {
    const v = JSON.parse(row.value) as Partial<AdminAuthRecord>;
    if (
      typeof v.passwordHash === "string" &&
      typeof v.salt === "string" &&
      typeof v.sessionSecret === "string" &&
      typeof v.isDefaultPassword === "boolean" &&
      typeof v.mustChangePassword === "boolean"
    ) {
      return v as AdminAuthRecord;
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

function passwordRecord(password: string, flags: AdminSecurityStatus): AdminAuthRecord {
  const salt = randomBytes(16).toString("hex");
  return {
    passwordHash: hashPassword(password, salt),
    salt,
    // Rotating the session secret invalidates every existing admin cookie.
    sessionSecret: randomBytes(32).toString("base64url"),
    ...flags,
  };
}

export function ensureAdminAuth(database: AppDatabase): AdminSecurityStatus {
  const existing = readRecord(database);
  if (existing) {
    return {
      isDefaultPassword: existing.isDefaultPassword,
      // Always require a change while the well-known default password is in use.
      mustChangePassword: existing.mustChangePassword || existing.isDefaultPassword,
    };
  }
  const record = passwordRecord(DEFAULT_PASSWORD, {
    isDefaultPassword: true,
    mustChangePassword: true,
  });
  writeRecord(database, record);
  return {
    isDefaultPassword: record.isDefaultPassword,
    mustChangePassword: record.mustChangePassword,
  };
}

function getRecord(database: AppDatabase): AdminAuthRecord {
  ensureAdminAuth(database);
  const record = readRecord(database);
  if (!record) throw new Error("无法读取管理员凭据");
  return record;
}

export function getAdminSecurityStatus(database: AppDatabase): AdminSecurityStatus {
  const record = getRecord(database);
  return {
    isDefaultPassword: record.isDefaultPassword,
    mustChangePassword: record.mustChangePassword || record.isDefaultPassword,
  };
}

export function getAdminSessionSecret(database: AppDatabase): string {
  return getRecord(database).sessionSecret;
}

export function verifyAdminPassword(database: AppDatabase, password: string): boolean {
  if (typeof password !== "string" || password.length === 0) return false;
  const record = getRecord(database);
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
    throw new Error("当前管理密码不正确。");
  }
  if (typeof newPassword !== "string" || newPassword.length === 0) {
    throw new Error("新密码不能为空。");
  }
  if (newPassword === currentPassword) {
    throw new Error("新密码不能与当前密码相同。");
  }
  if (newPassword === DEFAULT_PASSWORD) {
    throw new Error("新密码不能使用系统默认密码 password。");
  }
  writeRecord(
    database,
    passwordRecord(newPassword, {
      isDefaultPassword: false,
      mustChangePassword: false,
    })
  );
}

export function resetAdminPassword(database: AppDatabase): string {
  const temporary = randomBytes(18).toString("base64url");
  writeRecord(
    database,
    passwordRecord(temporary, {
      isDefaultPassword: false,
      mustChangePassword: true,
    })
  );
  return temporary;
}
