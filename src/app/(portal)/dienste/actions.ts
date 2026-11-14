"use server";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { assertOrigin, requireReadyUser } from "@/lib/auth";
import { dutyInput, DutyError } from "@/lib/duty-input";
import { updateDuties } from "@/lib/duties";
import { validationMessage, type ActionState } from "@/lib/validation";

export async function saveDuty(
  _previous: ActionState,
  data: FormData,
): Promise<ActionState> {
  const actor = await requireReadyUser();
  await assertOrigin();
  const input = dutyInput.safeParse({
    ...Object.fromEntries(data),
    teamIds: data.getAll("teamIds"),
  });
  if (!input.success) return { error: validationMessage(input.error) };
  try {
    await updateDuties(actor, input.data);
  } catch (error) {
    if (error instanceof DutyError) return { error: error.message };
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    )
      return {
        error:
          "Dieser Name, diese Zuordnung oder dieses Benutzerkonto wird bereits verwendet.",
      };
    return {
      error:
        "Die Änderung konnte nicht gespeichert werden. Bitte Daten prüfen und erneut versuchen.",
    };
  }
  revalidatePath("/");
  revalidatePath("/mitglieder");
  revalidatePath("/dienste");
  return { success: "Gespeichert." };
}
