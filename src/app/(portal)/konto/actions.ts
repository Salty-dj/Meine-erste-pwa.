"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
  assertOrigin,
  requireUser,
  COOKIE_NAME,
  cookieOptions,
} from "@/lib/auth";
import {
  hashPassword,
  verifyPassword,
  newToken,
  tokenHash,
} from "@/lib/password";
import { SESSION_DURATION_MS } from "@/lib/auth-service";
import {
  changePasswordSchema,
  type ActionState,
  validationMessage,
} from "@/lib/validation";
export async function logout() {
  await assertOrigin();
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (token)
    await db.session.deleteMany({ where: { tokenHash: tokenHash(token) } });
  (await cookies()).delete(COOKIE_NAME);
  redirect("/anmelden");
}
export async function changePassword(
  _previous: ActionState,
  data: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  await assertOrigin();
  const parsed = changePasswordSchema.safeParse(Object.fromEntries(data));
  if (!parsed.success) return { error: validationMessage(parsed.error) };
  try {
    const existing = await db.user.findUniqueOrThrow({
      where: { id: user.id },
    });
    if (
      !(await verifyPassword(
        parsed.data.currentPassword,
        existing.passwordHash,
      ))
    )
      return { error: "Das aktuelle Passwort stimmt nicht." };
    const hash = await hashPassword(parsed.data.password);
    const token = newToken();
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
    await db.$transaction(async (tx) => {
      // Optimistic lock avoids two simultaneous password changes overriding each other.
      const changed = await tx.user.updateMany({
        where: {
          id: user.id,
          passwordHash: existing.passwordHash,
          active: true,
        },
        data: { passwordHash: hash, mustChangePassword: false },
      });
      if (changed.count !== 1)
        throw new Error("Anmeldedaten wurden inzwischen geändert.");
      await tx.session.deleteMany({ where: { userId: user.id } });
      await tx.session.create({
        data: { userId: user.id, tokenHash: tokenHash(token), expiresAt },
      });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: "PASSWORD_CHANGED",
          entityType: "User",
          entityId: user.id,
        },
      });
    });
    (await cookies()).set(COOKIE_NAME, token, cookieOptions(expiresAt));
  } catch {
    return {
      error:
        "Passwortänderung nicht möglich. Bitte erneut anmelden und noch einmal versuchen.",
    };
  }
  revalidatePath("/", "layout");
  return {
    success: "Passwort geändert. Alle anderen Sitzungen wurden beendet.",
  };
}
