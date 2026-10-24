import { describe, expect, it } from "vitest";
import { createMemoryApplicationStorage } from "../storage/memory/application-storage";
import {
  AdminPasswordError,
  MIN_CONFIGURED_PASSWORD_LENGTH,
  changeAdminPassword,
  createInitialAdminCredentials,
  getAdminSessionSecret,
  isAdminCredentialsMissing,
  resetAdminPassword,
  verifyAdminPassword,
} from "../services/admin-credentials";

async function freshStorage() {
  return createMemoryApplicationStorage();
}

describe("createInitialAdminCredentials", () => {
  it("generates a password when none is configured", async () => {
    const storage = await freshStorage();
    const result = await createInitialAdminCredentials(storage.credentials);

    expect(result.source).toBe("generated");
    expect(result.password).toBeTruthy();
    expect(result.password!.length).toBeGreaterThan(20);
    expect(await isAdminCredentialsMissing(storage.credentials)).toBe(false);
    await expect(verifyAdminPassword(storage.credentials, result.password!)).resolves.toBe(true);
    await storage.close();
  });

  it("uses the configured password when it is long enough", async () => {
    const storage = await freshStorage();
    const result = await createInitialAdminCredentials(storage.credentials, "  correct-horse  ");

    expect(result).toEqual({ password: "correct-horse", source: "configured" });
    await expect(verifyAdminPassword(storage.credentials, "correct-horse")).resolves.toBe(true);
    await storage.close();
  });

  it("rejects a configured password that is too short", async () => {
    const storage = await freshStorage();
    await expect(createInitialAdminCredentials(storage.credentials, "short")).rejects.toThrow(
      `DEFAULT_ADMIN_PASSWORD is too short: use at least ${MIN_CONFIGURED_PASSWORD_LENGTH} characters.`
    );
    expect(await isAdminCredentialsMissing(storage.credentials)).toBe(true);
    await storage.close();
  });

  it("treats a whitespace-only password as unset", async () => {
    const storage = await freshStorage();
    const result = await createInitialAdminCredentials(storage.credentials, "    ");
    expect(result.source).toBe("generated");
    await storage.close();
  });

  it("keeps the existing record and reports a null password", async () => {
    const storage = await freshStorage();
    const first = await createInitialAdminCredentials(storage.credentials, "firstpassword");
    const second = await createInitialAdminCredentials(storage.credentials, "secondpassword");

    expect(second).toEqual({ password: null, source: null });
    await expect(verifyAdminPassword(storage.credentials, "firstpassword")).resolves.toBe(true);
    await expect(verifyAdminPassword(storage.credentials, "secondpassword")).resolves.toBe(false);
    expect(first.source).toBe("configured");
    await storage.close();
  });

  it("reuses a configured session secret", async () => {
    const storage = await freshStorage();
    await createInitialAdminCredentials(storage.credentials, "longenoughpassword", "fixed-secret");
    await expect(getAdminSessionSecret(storage.credentials)).resolves.toBe("fixed-secret");
    await storage.close();
  });

  it("generates a session secret when none is configured", async () => {
    const storage = await freshStorage();
    await createInitialAdminCredentials(storage.credentials, "longenoughpassword");
    const secret = await getAdminSessionSecret(storage.credentials);
    expect(secret.length).toBeGreaterThan(20);
    await storage.close();
  });
});

describe("verifyAdminPassword", () => {
  it("rejects empty passwords and missing records", async () => {
    const storage = await freshStorage();
    await expect(verifyAdminPassword(storage.credentials, "")).resolves.toBe(false);
    await expect(verifyAdminPassword(storage.credentials, "anything")).resolves.toBe(false);
    await storage.close();
  });

  it("rejects wrong passwords", async () => {
    const storage = await freshStorage();
    await createInitialAdminCredentials(storage.credentials, "correct-horse");
    await expect(verifyAdminPassword(storage.credentials, "correct-horsf")).resolves.toBe(false);
    await storage.close();
  });
});

describe("getAdminSessionSecret", () => {
  it("throws when credentials are missing", async () => {
    const storage = await freshStorage();
    await expect(getAdminSessionSecret(storage.credentials)).rejects.toThrow(
      "Admin credentials are not initialized."
    );
    await storage.close();
  });
});

describe("changeAdminPassword", () => {
  it("replaces the stored password", async () => {
    const storage = await freshStorage();
    await createInitialAdminCredentials(storage.credentials, "old-password");

    await changeAdminPassword(storage.credentials, "old-password", "new-password");
    await expect(verifyAdminPassword(storage.credentials, "new-password")).resolves.toBe(true);
    await expect(verifyAdminPassword(storage.credentials, "old-password")).resolves.toBe(false);
    await storage.close();
  });

  it("rejects a wrong current password", async () => {
    const storage = await freshStorage();
    await createInitialAdminCredentials(storage.credentials, "old-password");

    await expect(
      changeAdminPassword(storage.credentials, "wrong-password", "new-password")
    ).rejects.toMatchObject({
      name: "AdminPasswordError",
      code: "current_password_incorrect",
      message: "当前管理密码不正确。",
    });
    await storage.close();
  });

  it("rejects an empty new password", async () => {
    const storage = await freshStorage();
    await createInitialAdminCredentials(storage.credentials, "old-password");

    const failure = changeAdminPassword(storage.credentials, "old-password", "");
    await expect(failure).rejects.toBeInstanceOf(AdminPasswordError);
    await expect(failure).rejects.toMatchObject({
      code: "new_password_empty",
      message: "新密码不能为空。",
    });
    await storage.close();
  });

  it("rejects reusing the current password", async () => {
    const storage = await freshStorage();
    await createInitialAdminCredentials(storage.credentials, "old-password");

    await expect(
      changeAdminPassword(storage.credentials, "old-password", "old-password")
    ).rejects.toMatchObject({
      code: "new_password_same_as_current",
      message: "新密码不能与当前密码相同。",
    });
    await storage.close();
  });
});

describe("resetAdminPassword", () => {
  it("writes a temporary password that verifies once persisted", async () => {
    const storage = await freshStorage();
    await createInitialAdminCredentials(storage.credentials, "old-password");

    const temporary = resetAdminPassword(storage.credentials);
    expect(temporary.length).toBeGreaterThan(20);

    // resetAdminPassword is synchronous and does not await the write; wait for the
    // microtask queue to drain before asserting on the stored record.
    await new Promise((resolve) => setTimeout(resolve, 0));
    await expect(verifyAdminPassword(storage.credentials, temporary)).resolves.toBe(true);
    await storage.close();
  });
});
