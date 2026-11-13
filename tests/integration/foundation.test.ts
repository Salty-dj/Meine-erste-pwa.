import "dotenv/config";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { db } from "../../src/lib/db";
import { authenticate, sessionUser } from "../../src/lib/auth-service";
import {
  createAccount,
  ensureRoles,
  updateAccountRoles,
} from "../../src/lib/accounts";
import { hashPassword, newToken, tokenHash } from "../../src/lib/password";
import { getDashboard } from "../../src/lib/dashboard";
// Refuse to run against a development or production database.
if (
  !process.env.DATABASE_URL ||
  !new URL(process.env.DATABASE_URL).pathname.endsWith("_test")
)
  throw new Error(
    "Integrationstests benötigen eine separate Datenbank mit dem Suffix _test.",
  );
const password = "DEMO-Testpasswort-123!";
let adminId: string;
let memberId: string;
beforeAll(async () => {
  await ensureRoles();
  const passwordHash = await hashPassword(password);
  const admin = await db.user.upsert({
    where: { email: "demo-admin@example.test" },
    create: {
      email: "demo-admin@example.test",
      name: "DEMO Administration",
      passwordHash,
      mustChangePassword: false,
      roles: { create: { roleId: "SUPERADMIN" } },
    },
    update: {
      active: true,
      mustChangePassword: false,
      passwordHash,
      roles: { deleteMany: {}, create: { roleId: "SUPERADMIN" } },
    },
  });
  adminId = admin.id;
  const member = await db.user.upsert({
    where: { email: "demo-member@example.test" },
    create: {
      email: "demo-member@example.test",
      name: "DEMO Mitglied",
      passwordHash,
      mustChangePassword: false,
      roles: { create: { roleId: "MEMBER" } },
    },
    update: { active: true, mustChangePassword: false, passwordHash },
  });
  memberId = member.id;
});
beforeEach(async () => {
  await db.loginThrottle.deleteMany();
});
afterAll(async () => {
  await db.$disconnect();
});
test("login, hashed session, expiration and deactivation", async () => {
  expect(await authenticate("demo-admin@example.test", "wrong")).toEqual({
    ok: false,
  });
  const result = await authenticate("demo-admin@example.test", password);
  expect(result.ok).toBe(true);
  if (!result.ok) throw Error("login");
  expect((await sessionUser(result.token))?.id).toBe(adminId);
  expect(
    await db.session.findUnique({ where: { tokenHash: result.token } }),
  ).toBeNull();
  await db.session.update({
    where: { tokenHash: tokenHash(result.token) },
    data: { expiresAt: new Date(0) },
  });
  expect(await sessionUser(result.token)).toBeNull();
  expect(await sessionUser(newToken())).toBeNull();
});
test("persistent rate limiting blocks a valid password after 5 failures", async () => {
  for (let i = 0; i < 5; i++)
    await authenticate("demo-admin@example.test", "wrong");
  expect(await authenticate("demo-admin@example.test", password)).toEqual({
    ok: false,
  });
});
test("only superadmin creates accounts; no duplicate email; password change required", async () => {
  const input = {
    name: "DEMO Neue Person",
    email: "demo-new@example.test",
    password,
    roles: ["MEMBER"],
  };
  await expect(createAccount(memberId, input)).rejects.toThrow("Zugriff");
  await db.user.deleteMany({ where: { email: input.email } });
  const id = await createAccount(adminId, input);
  const user = await db.user.findUniqueOrThrow({ where: { id } });
  expect(user.mustChangePassword).toBe(true);
  expect(user.passwordHash).not.toBe(password);
  await expect(createAccount(adminId, input)).rejects.toThrow();
  const login = await authenticate(input.email, password);
  expect(login.ok && login.mustChangePassword).toBe(true);
});
test("last superadmin stays active and privilege changes revoke sessions", async () => {
  await expect(
    updateAccountRoles(adminId, {
      userId: adminId,
      active: false,
      roles: ["MEMBER"],
    }),
  ).rejects.toThrow("letzte");
  const login = await authenticate("demo-member@example.test", password);
  if (!login.ok) throw Error("login");
  await updateAccountRoles(adminId, {
    userId: memberId,
    roles: ["MEMBER", "WAREHOUSE_MANAGER"],
    active: true,
  });
  expect(await sessionUser(login.token)).toBeNull();
  await updateAccountRoles(adminId, {
    userId: memberId,
    roles: ["MEMBER"],
    active: true,
  });
});
test("member dashboard excludes foreign tasks and finance", async () => {
  const tag = "DEMO-Integration-" + Date.now();
  await db.task.createMany({
    data: [
      { title: tag + " own", assigneeId: memberId },
      { title: tag + " private", assigneeId: adminId },
    ],
  });
  await db.financeTransaction.create({
    data: {
      amountCents: 900,
      costCenter: "DEMO",
      description: tag,
      bookedAt: new Date(),
    },
  });
  const user = {
    id: memberId,
    name: "DEMO",
    email: "demo-member@example.test",
    active: true,
    mustChangePassword: false,
    roles: ["MEMBER" as const],
  };
  const data = await getDashboard(user);
  expect(data.openTasks.every((t) => !t.title.includes("private"))).toBe(true);
  expect(data.openTasks.some((t) => t.title === tag + " own")).toBe(true);
  expect(data.finance).toBe(false);
  expect(data.financeCents).toBe(0);
  await db.task.deleteMany({ where: { title: { startsWith: tag } } });
  await db.financeTransaction.deleteMany({ where: { description: tag } });
});
test("stock ledger rejects negative stock and remains immutable", async () => {
  const category = await db.productCategory.upsert({
    where: { name: "DEMO Test" },
    create: { name: "DEMO Test" },
    update: {},
  });
  const warehouse = await db.warehouse.upsert({
    where: { name: "DEMO Testlager" },
    create: { name: "DEMO Testlager" },
    update: {},
  });
  const product = await db.product.create({
    data: {
      sku: "DEMO-" + Date.now(),
      name: "DEMO Wasser",
      categoryId: category.id,
      unit: "Flasche",
      purchasePriceCents: 100,
      salePriceCents: 200,
    },
  });
  const movement = await db.stockMovement.create({
    data: {
      productId: product.id,
      warehouseId: warehouse.id,
      type: "RECEIPT",
      quantity: 2,
      reason: "DEMO Test",
    },
  });
  await expect(
    db.stockMovement.create({
      data: {
        productId: product.id,
        warehouseId: warehouse.id,
        type: "ISSUE",
        quantity: -3,
        reason: "DEMO Test",
      },
    }),
  ).rejects.toThrow();
  await expect(
    db.stockMovement.update({
      where: { id: movement.id },
      data: { quantity: 99 },
    }),
  ).rejects.toThrow();
  expect(
    (
      await db.stockMovement.aggregate({
        where: { productId: product.id },
        _sum: { quantity: true },
      })
    )._sum.quantity,
  ).toBe(2);
});

test("concurrent admin demotions cannot remove all superadmins", async () => {
  await db.user.deleteMany({
    where: { email: "demo-second-admin@example.test" },
  });
  const secondId = await createAccount(adminId, {
    name: "DEMO Zweite Administration",
    email: "demo-second-admin@example.test",
    password,
    roles: ["SUPERADMIN"],
  });
  await db.user.update({
    where: { id: secondId },
    data: { mustChangePassword: false },
  });
  const results = await Promise.allSettled([
    updateAccountRoles(adminId, {
      userId: adminId,
      active: true,
      roles: ["MEMBER"],
    }),
    updateAccountRoles(secondId, {
      userId: secondId,
      active: true,
      roles: ["MEMBER"],
    }),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(
    await db.user.count({
      where: { active: true, roles: { some: { roleId: "SUPERADMIN" } } },
    }),
  ).toBe(1);
  await db.user.update({
    where: { id: adminId },
    data: { roles: { deleteMany: {}, create: { roleId: "SUPERADMIN" } } },
  });
  await db.user.delete({ where: { id: secondId } });
});

test("concurrent stock withdrawals cannot oversell the last item", async () => {
  const category = await db.productCategory.upsert({
    where: { name: "DEMO Test" },
    create: { name: "DEMO Test" },
    update: {},
  });
  const warehouse = await db.warehouse.upsert({
    where: { name: "DEMO Testlager" },
    create: { name: "DEMO Testlager" },
    update: {},
  });
  const product = await db.product.create({
    data: {
      sku: "DEMO-CONCURRENT-" + Date.now(),
      name: "DEMO Letzte Flasche",
      categoryId: category.id,
      unit: "Flasche",
      purchasePriceCents: 100,
      salePriceCents: 200,
    },
  });
  const common = {
    productId: product.id,
    warehouseId: warehouse.id,
    reason: "DEMO Nebenläufigkeitstest",
  };
  await db.stockMovement.create({
    data: { ...common, quantity: 1, type: "RECEIPT" },
  });
  const results = await Promise.allSettled(
    [1, 2].map(() =>
      db.stockMovement.create({
        data: { ...common, quantity: -1, type: "ISSUE" },
      }),
    ),
  );
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(
    (
      await db.stockMovement.aggregate({
        where: { productId: product.id },
        _sum: { quantity: true },
      })
    )._sum.quantity,
  ).toBe(0);
});
