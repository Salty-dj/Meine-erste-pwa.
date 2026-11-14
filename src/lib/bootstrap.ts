import { db } from "./db";
import { hashPassword } from "./password";
import { createUserSchema } from "./validation";
import { roleCodes, roleLabels } from "./roles";

/** Explicit one-time bootstrap. An existing active admin is never reset or overwritten. */
export async function bootstrapAdmin(input: unknown) {
  const data = createUserSchema.parse(input);
  // Skip repeated hashing on Render cold starts. The locked check below is authoritative.
  if (
    await db.user.count({
      where: { active: true, roles: { some: { roleId: "SUPERADMIN" } } },
    })
  )
    return false;
  const passwordHash = await hashPassword(data.password);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(14072000)`;
    if (
      await tx.user.count({
        where: { active: true, roles: { some: { roleId: "SUPERADMIN" } } },
      })
    )
      return false;
    for (const id of roleCodes)
      await tx.role.upsert({
        where: { id },
        create: { id, label: roleLabels[id] },
        update: {},
      });
    const user = await tx.user.create({
      data: {
        email: data.email,
        name: data.name,
        passwordHash,
        roles: { create: { roleId: "SUPERADMIN" } },
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "INITIAL_ADMIN_CREATED",
        entityType: "User",
        entityId: user.id,
      },
    });
    return true;
  });
}
