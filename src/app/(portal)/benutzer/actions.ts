"use server";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { assertOrigin, requirePermission } from "@/lib/auth";
import { createAccount, updateAccountRoles } from "@/lib/accounts";
import {
  createUserSchema,
  updateRolesSchema,
  type ActionState,
  validationMessage,
} from "@/lib/validation";
export async function createUser(
  _prev: ActionState,
  data: FormData,
): Promise<ActionState> {
  const user = await requirePermission("accounts");
  await assertOrigin();
  const input = createUserSchema.safeParse({
    name: data.get("name"),
    email: data.get("email"),
    password: data.get("password"),
    roles: data.getAll("roles"),
  });
  if (!input.success) return { error: validationMessage(input.error) };
  try {
    await createAccount(user.id, input.data);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    )
      return { error: "Diese E-Mail-Adresse wird bereits verwendet." };
    return { error: "Das Konto konnte nicht erstellt werden." };
  }
  revalidatePath("/benutzer");
  return {
    success:
      "Konto erstellt. Das Startpasswort sicher und getrennt weitergeben; beim ersten Login muss es geändert werden.",
  };
}
export async function updateRoles(
  _prev: ActionState,
  data: FormData,
): Promise<ActionState> {
  const user = await requirePermission("accounts");
  await assertOrigin();
  const parsed = updateRolesSchema.safeParse({
    userId: data.get("userId"),
    roles: data.getAll("roles"),
    active: data.get("active") === "on",
  });
  if (!parsed.success) return { error: validationMessage(parsed.error) };
  try {
    await updateAccountRoles(user.id, parsed.data);
  } catch (error) {
    return {
      error:
        error instanceof Error && error.message.startsWith("Der letzte")
          ? error.message
          : "Berechtigungen konnten nicht aktualisiert werden.",
    };
  }
  revalidatePath("/", "layout");
  return {
    success:
      "Berechtigungen gespeichert. Bestehende Sitzungen dieses Kontos wurden beendet.",
  };
}
