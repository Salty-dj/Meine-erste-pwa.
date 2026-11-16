"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertOrigin, requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { DutyError } from "@/lib/duty-input";
import { readSchedule } from "@/lib/hall/import";
import { optionsSchema } from "@/lib/hall/planner";
import { proposeRules } from "@/lib/hall/rule-text";
import {
  createPlanSchema,
  editPlanSchema,
  generateSeason,
  HallError,
  hallWrite,
  importMatches,
  importSchema,
  newPlan,
  publishPlan,
  savePlan,
} from "@/lib/hall/service";

const publishSchema = z.object({
  id: z.string().min(1).max(100),
  revision: z.number().int().nonnegative(),
  publish: z.boolean(),
});
const command = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("create"), data: createPlanSchema }),
  z.object({ kind: z.literal("edit"), data: editPlanSchema }),
  z.object({ kind: z.literal("publish"), data: publishSchema }),
  z.object({ kind: z.literal("import"), data: importSchema }),
  z.object({ kind: z.literal("generate"), data: optionsSchema }),
]);

export async function runHallCommand(input: unknown) {
  const actor = await requirePermission("hall");
  await assertOrigin();
  const parsed = command.safeParse(input);
  if (!parsed.success)
    return {
      ok: false as const,
      error: parsed.error.issues
        .map((issue) => `${issue.path.slice(1).join(" / ")}: ${issue.message}`)
        .slice(0, 4)
        .join(" · "),
    };
  const value = parsed.data;
  try {
    const result = await hallWrite(actor.id, async (tx) => {
      const result = await (async () => {
        switch (value.kind) {
          case "create":
            return newPlan(tx, value.data);
          case "edit":
            return savePlan(tx, value.data);
          case "publish":
            return publishPlan(
              tx,
              value.data.id,
              value.data.revision,
              value.data.publish,
            );
          case "import":
            return importMatches(tx, value.data);
          case "generate":
            return generateSeason(tx, value.data);
        }
      })();
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: `HALL_${value.kind.toUpperCase()}`,
          entityType: "HallPlan",
          entityId: "id" in result ? result.id : null,
        },
      });
      return result;
    });
    revalidatePath("/hallenbewirtung");
    return { ok: true as const, result };
  } catch (error) {
    if (!(error instanceof HallError || error instanceof DutyError))
      console.error(
        "Hall command failed",
        value.kind,
        error instanceof Error ? error.name : "unknown",
      );
    return {
      ok: false as const,
      error:
        error instanceof HallError || error instanceof DutyError
          ? error.message
          : "Änderung fehlgeschlagen. Bitte Eingaben prüfen und erneut versuchen.",
    };
  }
}

export async function previewHallImport(data: FormData) {
  await requirePermission("hall");
  await assertOrigin();
  const file = data.get("file");
  if (!(file instanceof File)) return { error: "Bitte eine Datei auswählen." };
  try {
    const [{ rows, notes }, teams] = await Promise.all([
      readSchedule(file),
      db.team.findMany({ select: { id: true, name: true } }),
    ]);
    const normalize = (value: string) => value.trim().toLocaleLowerCase("de");
    for (const row of rows) {
      const matches = teams.filter(({ name }) =>
        [row.home, row.away, row.teamLabel].some(
          (label) => normalize(label) === normalize(name),
        ),
      );
      if (matches.length === 1) {
        row.teamId = matches[0].id;
        if (normalize(row.away) === normalize(matches[0].name))
          row.ownHome = false;
        if (normalize(row.home) === normalize(matches[0].name))
          row.ownHome = true;
      }
    }
    return { rows, notes };
  } catch {
    return {
      error:
        "Datei konnte nicht gelesen werden. Bitte Format, Größe und Spalten nach der Vorlage prüfen. PDF-Dateien benötigen eine Textebene.",
    };
  }
}

export async function parseHallRules(text: string) {
  await requirePermission("hall");
  await assertOrigin();
  if (typeof text !== "string" || text.length > 3000)
    return { rules: [], unmatched: ["Maximal 3.000 Zeichen."] };
  return proposeRules(
    text,
    await db.team.findMany({ select: { id: true, name: true } }),
  );
}

export async function setHallRole(userId: string, enabled: boolean) {
  const actor = await requirePermission("club");
  await assertOrigin();
  if (
    typeof userId !== "string" ||
    !userId ||
    userId.length > 100 ||
    typeof enabled !== "boolean"
  )
    return { ok: false as const, error: "Ungültiges Benutzerkonto." };
  try {
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(14072000)`;
      const current = await tx.user.findFirst({
        where: {
          id: actor.id,
          active: true,
          mustChangePassword: false,
          roles: { some: { roleId: { in: ["SUPERADMIN", "CLUB_ADMIN"] } } },
        },
      });
      if (!current) throw new HallError("Zugriff nicht erlaubt.");
      const target = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        include: { roles: true },
      });
      if (
        target.roles.some((role) => role.roleId === "HALL_CATERING") === enabled
      )
        return;
      if (enabled)
        await tx.userRole.create({ data: { userId, roleId: "HALL_CATERING" } });
      else
        await tx.userRole.delete({
          where: { userId_roleId: { userId, roleId: "HALL_CATERING" } },
        });
      await tx.session.deleteMany({ where: { userId } });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: enabled ? "HALL_ROLE_GRANTED" : "HALL_ROLE_REVOKED",
          entityType: "User",
          entityId: userId,
        },
      });
    });
    revalidatePath("/hallenbewirtung");
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: "Rolle konnte nicht geändert werden." };
  }
}
