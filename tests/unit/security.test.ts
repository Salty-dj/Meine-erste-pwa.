import { expect, test } from "vitest";
import {
  hashPassword,
  verifyPassword,
  tokenHash,
  newToken,
} from "../../src/lib/password";
import { can, roleCodes } from "../../src/lib/roles";
import {
  createUserSchema,
  loginSchema,
  changePasswordSchema,
} from "../../src/lib/validation";
test("passwords use salted scrypt and reject wrong credentials", async () => {
  const a = await hashPassword("DemoTest-Passwort-123!");
  const b = await hashPassword("DemoTest-Passwort-123!");
  expect(a).not.toBe(b);
  expect(a).not.toContain("DemoTest");
  expect(await verifyPassword("DemoTest-Passwort-123!", a)).toBe(true);
  expect(await verifyPassword("falsch", a)).toBe(false);
  expect(await verifyPassword("x", "broken")).toBe(false);
});
test("session tokens are random and hashed", () => {
  const token = newToken();
  expect(token).toMatch(/^[0-9a-f]{64}$/);
  expect(token).not.toBe(newToken());
  expect(tokenHash(token)).toHaveLength(64);
  expect(tokenHash(token)).not.toBe(token);
});
test("least privilege and combined roles", () => {
  for (const r of roleCodes)
    expect(can([r], "accounts")).toBe(r === "SUPERADMIN");
  expect(can(["MEMBER"], "finance")).toBe(false);
  expect(can(["WAREHOUSE_MANAGER"], "stock")).toBe(true);
  expect(can(["CASH_MANAGER"], "stock")).toBe(false);
  expect(can(["MEMBER", "TEAM_MANAGER"], "team")).toBe(true);
  expect(can(["CLUB_ADMIN"], "finance")).toBe(true);
});
test("server validation normalizes emails and rejects invalid accounts and passwords", () => {
  expect(
    loginSchema.parse({ email: "  NAME@VEREIN.DE ", password: "secret" }).email,
  ).toBe("name@verein.de");
  expect(
    createUserSchema.safeParse({
      email: "a@b.de",
      name: "Demo",
      password: "short",
      roles: ["MEMBER"],
    }).success,
  ).toBe(false);
  expect(
    createUserSchema.safeParse({
      email: "a@b.de",
      name: "Demo",
      password: "long-secret-password",
      roles: ["ROOT"],
    }).success,
  ).toBe(false);
  expect(
    createUserSchema.safeParse({
      email: "a@b.de",
      name: "Demo",
      password: "long-secret-password",
      roles: [],
    }).success,
  ).toBe(false);
  expect(
    changePasswordSchema.safeParse({
      currentPassword: "old",
      password: "new-long-password",
      confirmPassword: "different-password",
    }).success,
  ).toBe(false);
  expect(
    changePasswordSchema.safeParse({
      currentPassword: "same-long-password",
      password: "same-long-password",
      confirmPassword: "same-long-password",
    }).success,
  ).toBe(false);
});
