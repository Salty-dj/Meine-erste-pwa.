import { db } from "./db";
import { dummyHash, newToken, tokenHash, verifyPassword } from "./password";
export const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;
const WINDOW_MS = 15 * 60 * 1000;
export async function authenticate(email: string, password: string) {
  const key = tokenHash(email);
  return db.$transaction(
    async (tx) => {
      // Serialize throttling updates across all app instances, not just one process.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(14071999)`;
      const now = new Date();
      const buckets = await Promise.all(
        [key, "global"].map(async (bucket) => {
          const existing = await tx.loginThrottle.findUnique({
            where: { key: bucket },
          });
          if (
            !existing ||
            now.getTime() - existing.windowStart.getTime() >= WINDOW_MS
          )
            return tx.loginThrottle.upsert({
              where: { key: bucket },
              create: { key: bucket },
              update: { failures: 0, windowStart: now, lockedUntil: null },
            });
          return existing;
        }),
      );
      if (buckets.some((b) => b.lockedUntil && b.lockedUntil > now))
        return { ok: false as const };
      const user = await tx.user.findUnique({
        where: { email },
        include: { roles: true },
      });
      const correct = await verifyPassword(
        password,
        user?.passwordHash ?? dummyHash,
      );
      if (!user || !user.active || !correct || !user.roles.length) {
        for (const bucket of buckets) {
          const failures = bucket.failures + 1;
          await tx.loginThrottle.update({
            where: { key: bucket.key },
            data: {
              failures,
              lockedUntil:
                failures >= (bucket.key === "global" ? 200 : 5)
                  ? new Date(now.getTime() + WINDOW_MS)
                  : null,
            },
          });
        }
        await tx.auditLog.create({
          data: {
            action: "LOGIN_FAILED",
            entityType: "Authentication",
            entityId: key,
          },
        });
        return { ok: false as const };
      }
      const token = newToken();
      const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS);
      await tx.session.create({
        data: { tokenHash: tokenHash(token), userId: user.id, expiresAt },
      });
      await tx.loginThrottle.update({
        where: { key },
        data: { failures: 0, lockedUntil: null },
      });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: "LOGIN",
          entityType: "User",
          entityId: user.id,
        },
      });
      return {
        ok: true as const,
        token,
        expiresAt,
        mustChangePassword: user.mustChangePassword,
      };
    },
    { timeout: 15000 },
  );
}
export async function sessionUser(token: string | undefined) {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: tokenHash(token) },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          active: true,
          mustChangePassword: true,
          roles: { select: { roleId: true } },
        },
      },
    },
  });
  if (!session || session.expiresAt <= new Date() || !session.user.active)
    return null;
  return { ...session.user, roles: session.user.roles.map((r) => r.roleId) };
}
