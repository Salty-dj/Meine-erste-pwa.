import { Prisma } from "@prisma/client";
import { db } from "./db";
import { hashPassword } from "./password";
import { createUserSchema, updateRolesSchema } from "./validation";
import { roleLabels, roleCodes } from "./roles";
export async function ensureRoles() {
  for (const id of roleCodes)
    await db.role.upsert({
      where: { id },
      create: { id, label: roleLabels[id] },
      update: { label: roleLabels[id] },
    });
}
export async function createAccount(actorId: string, input: unknown) {
  const data = createUserSchema.parse(input);
  const hash = await hashPassword(data.password);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(14072000)`;
    const actor = await tx.user.findFirst({
      where: {
        id: actorId,
        active: true,
        mustChangePassword: false,
        roles: { some: { roleId: "SUPERADMIN" } },
      },
    });
    if (!actor) throw new Error("Zugriff nicht erlaubt.");
    const user = await tx.user.create({
      data: {
        email: data.email,
        name: data.name,
        passwordHash: hash,
        roles: {
          create: [...new Set(data.roles)].map((roleId) => ({ roleId })),
        },
      },
    });
    await tx.auditLog.create({
      data: {
        actorId,
        action: "ACCOUNT_CREATED",
        entityType: "User",
        entityId: user.id,
        details: { roles: data.roles },
      },
    });
    return user.id;
  });
}
export async function updateAccountRoles(actorId: string, input: unknown) {
  const data = updateRolesSchema.parse(input);
  await db.$transaction(
    async (tx) => {
      // Prevent concurrent administrators from deactivating/demoting the last admins.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(14072000)`;
      const actor = await tx.user.findFirst({
        where: {
          id: actorId,
          active: true,
          mustChangePassword: false,
          roles: { some: { roleId: "SUPERADMIN" } },
        },
      });
      if (!actor) throw new Error("Zugriff nicht erlaubt.");
      const target = await tx.user.findUniqueOrThrow({
        where: { id: data.userId },
        include: { roles: true },
      });
      if (
        target.active &&
        target.roles.some((r) => r.roleId === "SUPERADMIN") &&
        (!data.active || !data.roles.includes("SUPERADMIN"))
      ) {
        const count = await tx.user.count({
          where: { active: true, roles: { some: { roleId: "SUPERADMIN" } } },
        });
        if (count <= 1)
          throw new Error(
            "Der letzte aktive Superadministrator muss erhalten bleiben.",
          );
      }
      await tx.user.update({
        where: { id: data.userId },
        data: {
          active: data.active,
          roles: {
            deleteMany: {},
            create: [...new Set(data.roles)].map((roleId) => ({ roleId })),
          },
        },
      });
      await tx.session.deleteMany({ where: { userId: data.userId } });
      await tx.auditLog.create({
        data: {
          actorId,
          action: "ACCOUNT_ACCESS_UPDATED",
          entityType: "User",
          entityId: data.userId,
          details: { active: data.active, roles: data.roles },
        },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
  );
}
