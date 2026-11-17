import { Prisma, type RoleCode } from "@prisma/client";
import { z } from "zod";
import { db } from "../db";
import { dutyTime } from "../duty-input";
import { can } from "../roles";
import { fixture, importRowSchema, type ImportRow } from "./import";
import {
  dayOf,
  hallDay,
  wallValue,
  optionsSchema,
  overlap,
  schedule,
  splitShifts,
  wall,
  type Match,
  type Options,
  type Slot,
} from "./planner";

const id = z.string().min(1).max(100);
const name = z.string().trim().min(1).max(160);
const people = z.number().int().min(1).max(100);
const memberIds = z.array(id).max(100);
const helperName = z
  .string()
  .trim()
  .max(160)
  .regex(/^[^\p{Cc}]*$/u);
export const hallTaskNamesSchema = z.object({
  id,
  revision: z.number().int().nonnegative(),
  names: z.object({
    PURCHASE: z.array(helperName).max(100),
    OPEN: z.array(helperName).max(100),
    CLOSE: z.array(helperName).max(100),
  }),
});
const interval = { start: wall, end: wall };
export const createPlanSchema = z.object({
  title: name,
  venue: name,
  notes: z.string().max(3000),
  ...interval,
  people,
  duration: z.number().int().min(15).max(720),
});
export const editPlanSchema = z.object({
  id,
  revision: z.number().int().nonnegative(),
  title: name,
  venue: name,
  notes: z.string().max(3000),
  ...interval,
  shifts: z
    .array(
      z.object({
        id: id.nullable(),
        teamId: id.nullable(),
        ...interval,
        people,
        locked: z.boolean(),
        memberIds,
      }),
    )
    .min(1)
    .max(150),
  tasks: z.object({ PURCHASE: memberIds, OPEN: memberIds, CLOSE: memberIds }),
});
export const importSchema = z.array(importRowSchema).min(1).max(1000);
const shiftIdentity = { id, revision: z.number().int().nonnegative() };
export const shiftStaffingSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("team"),
      ...shiftIdentity,
      teamId: id.nullable(),
      times: z.object(interval).strict().optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("people"),
      ...shiftIdentity,
      names: z.array(helperName).max(100),
      removedMemberIds: memberIds,
    })
    .strict(),
]);
const clockTime = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const festPeopleSchema = z
  .object({ names: z.array(helperName).max(100), removedMemberIds: memberIds })
  .strict();
export const festChangesSchema = z
  .object({
    ...shiftIdentity,
    day: hallDay.optional(),
    tasks: hallTaskNamesSchema.shape.names.strict().optional(),
    shifts: z
      .array(
        z
          .object({
            id,
            schedule: z
              .object({
                start: clockTime,
                end: clockTime,
                teamId: id.nullable(),
              })
              .strict()
              .optional(),
            people: festPeopleSchema.optional(),
          })
          .strict(),
      )
      .max(150),
  })
  .strict();

export const hallManagersSchema = z
  .object({ id, memberIds, previousMemberIds: memberIds })
  .strict();
export class HallError extends Error {}
type Tx = Prisma.TransactionClient;

function withHallActor<T>(
  actorId: string,
  operation: (tx: Tx, roles: RoleCode[]) => Promise<T>,
) {
  return db.$transaction(
    async (tx) => {
      // Share the lock with ordinary duty planning for cross-module conflict checks.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(14072002)`;
      const actor = await tx.user.findUnique({
        where: { id: actorId },
        include: { roles: true },
      });
      if (!actor?.active || actor.mustChangePassword)
        throw new HallError("Zugriff nicht erlaubt.");
      return operation(
        tx,
        actor.roles.map((role) => role.roleId),
      );
    },
    { isolationLevel: "ReadCommitted", maxWait: 8000, timeout: 30000 },
  );
}

export function hallWrite<T>(
  actorId: string,
  operation: (tx: Tx) => Promise<T>,
) {
  return withHallActor(actorId, (tx, roles) => {
    if (!can(roles, "hall")) throw new HallError("Zugriff nicht erlaubt.");
    return operation(tx);
  });
}

export function saveHallManagers(
  actorId: string,
  input: z.infer<typeof hallManagersSchema>,
) {
  return hallWrite(actorId, async (tx) => {
    await tx.team.findUniqueOrThrow({
      where: { id: input.id },
      select: { id: true },
    });
    const current = await tx.hallTeamManager.findMany({
      where: { teamId: input.id },
    });
    const selected = [...new Set(input.memberIds)];
    const existing = new Set(current.map(({ memberId }) => memberId));
    const sameSelection = (ids: string[]) =>
      ids.length === existing.size && ids.every((id) => existing.has(id));
    if (sameSelection(selected)) return;
    if (!sameSelection([...new Set(input.previousMemberIds)]))
      throw new HallError(
        "Die Verantwortlichen wurden zwischenzeitlich geändert. Bitte neu laden.",
      );
    const added = selected.filter((id) => !existing.has(id));
    if (
      added.length &&
      (await tx.member.count({
        where: { id: { in: added }, active: true },
      })) !== added.length
    )
      throw new HallError(
        "Neue Verantwortliche müssen aktive Vereinsmitglieder sein.",
      );
    const removed = [...existing].filter((id) => !selected.includes(id));
    if (removed.length)
      await tx.hallTeamManager.deleteMany({
        where: { teamId: input.id, memberId: { in: removed } },
      });
    if (added.length)
      await tx.hallTeamManager.createMany({
        data: added.map((memberId) => ({ teamId: input.id, memberId })),
      });
    await tx.auditLog.create({
      data: {
        actorId,
        action: "HALL_TEAM_MANAGERS",
        entityType: "Team",
        entityId: input.id,
      },
    });
  });
}

export async function saveHallTaskNames(
  tx: Tx,
  input: z.infer<typeof hallTaskNamesSchema>,
) {
  const plan = await tx.hallPlan.findUnique({
    where: { id: input.id },
    select: { revision: true },
  });
  if (plan?.revision !== input.revision)
    throw new HallError(
      "Der Plan wurde zwischenzeitlich geändert. Bitte neu laden.",
    );

  await writeHallTaskNames(tx, input.id, input.names);
  await tx.hallPlan.update({
    where: { id: input.id },
    data: { revision: { increment: 1 } },
  });
  return { id: input.id };
}

async function writeHallTaskNames(
  tx: Tx,
  planId: string,
  names: z.infer<typeof hallTaskNamesSchema>["names"],
) {
  for (const kind of ["PURCHASE", "OPEN", "CLOSE"] as const) {
    const helperNames = names[kind].filter(Boolean);
    await tx.hallTask.upsert({
      where: { planId_kind: { planId, kind } },
      create: { planId, kind, helperNames },
      update: { helperNames },
    });
  }
}

function staffingPeople(
  shift: { members: { id: string }[]; requiredHelpers: number },
  input: z.infer<typeof festPeopleSchema>,
) {
  const removed = [...new Set(input.removedMemberIds)];
  if (removed.some((id) => !shift.members.some((member) => member.id === id)))
    throw new HallError(
      "Mindestens eine Person ist dieser Schicht nicht zugeteilt.",
    );
  const helperNames = input.names.slice(
    0,
    input.names.findLastIndex(Boolean) + 1,
  );
  const members = shift.members.filter(({ id }) => !removed.includes(id));
  if (helperNames.length > Math.max(0, shift.requiredHelpers - members.length))
    throw new HallError(
      "Es sind mehr Personen eingetragen als Plätze vorgesehen.",
    );
  return { removed, helperNames };
}

export function saveShiftStaffing(
  actorId: string,
  input: z.infer<typeof shiftStaffingSchema>,
) {
  return withHallActor(actorId, async (tx, roles) => {
    const coordinator = can(roles, "hall");
    if (input.kind === "team" && !coordinator)
      throw new HallError(
        "Nur Hallenbewirtung und Administratoren dürfen Mannschaften ändern.",
      );
    const shift = await tx.hallShift.findUnique({
      where: { id: input.id },
      include: {
        plan: true,
        members: {
          select: {
            id: true,
            active: true,
            teams: { select: { teamId: true } },
          },
        },
      },
    });
    if (
      !shift ||
      (!coordinator &&
        (!shift.teamId ||
          !(await tx.hallTeamManager.findFirst({
            where: {
              teamId: shift.teamId,
              member: { userId: actorId, active: true },
            },
            select: { memberId: true },
          }))))
    )
      throw new HallError("Für diese Schicht fehlt die Berechtigung.");
    if (shift.staffingRevision !== input.revision)
      throw new HallError(
        "Diese Schicht wurde zwischenzeitlich geändert. Bitte neu laden.",
      );

    let data: Prisma.HallShiftUpdateInput;
    if (input.kind === "team") {
      const times = input.times
        ? dates(input.times.start, input.times.end)
        : null;
      const moved =
        times !== null &&
        (+times.startsAt !== +shift.startsAt ||
          +times.endsAt !== +shift.endsAt);
      if (!moved && shift.teamId === input.teamId) return;
      if (
        times &&
        (times.startsAt < shift.plan.startsAt ||
          times.endsAt > shift.plan.endsAt)
      )
        throw new HallError("Die Schicht muss im Bewirtungszeitraum liegen.");
      const proposed = { ...shift, ...(times ?? {}) };
      if (
        input.teamId &&
        input.teamId !== shift.teamId &&
        !(await tx.team.findUnique({
          where: { id: input.teamId },
          select: { id: true },
        }))
      )
        throw new HallError("Die Mannschaft ist nicht mehr vorhanden.");

      if (input.teamId || (moved && shift.members.length)) {
        const config = planOptions(shift.plan);
        const { lt, gte } = windowFor(config);
        const window = {
          gte: new Date(Math.min(+gte, +proposed.startsAt - 3 * 86400000)),
          lt: new Date(Math.max(+lt, +proposed.endsAt + 4 * 86400000)),
        };
        const matches = await tx.hallMatch.findMany({
          where: { startsAt: window },
        });
        if (input.teamId) {
          const conflict = schedule(
            [{ ...proposed, teamId: null, locked: false }],
            matches,
            { ...config, teamIds: [input.teamId] },
            await fixedSlots(tx, window, [shift.id]),
          )[0]?.conflict;
          if (conflict) throw new HallError(conflict);
        }
        if (moved) await checkShiftMembers(tx, proposed, config, matches);
      }
      data = {
        ...(moved ? times : {}),
        team: input.teamId
          ? { connect: { id: input.teamId } }
          : { disconnect: true },
        conflict: "",
      };
    } else {
      const { removed, helperNames } = staffingPeople(shift, input);
      data = {
        helperNames,
        members: { disconnect: removed.map((id) => ({ id })) },
      };
    }
    await tx.hallShift.update({
      where: { id: shift.id },
      data: {
        ...data,
        staffingRevision: { increment: 1 },
      },
    });
    await tx.hallPlan.update({
      where: { id: shift.planId },
      data: { revision: { increment: 1 } },
    });
    await tx.auditLog.create({
      data: {
        actorId,
        action: input.kind === "team" ? "HALL_SHIFT_EDIT" : "HALL_SHIFT_PEOPLE",
        entityType: "HallShift",
        entityId: shift.id,
      },
    });
  });
}

const calendarMillis = (day: string) => Date.parse(day + "T00:00:00Z");

function shiftWallDay(day: string, offset: number) {
  return new Date(calendarMillis(day) + offset).toISOString().slice(0, 10);
}

export function saveFestChanges(
  actorId: string,
  input: z.infer<typeof festChangesSchema>,
) {
  return withHallActor(actorId, async (tx, roles) => {
    const coordinator = can(roles, "hall");
    if (
      !coordinator &&
      (input.day ||
        input.tasks ||
        input.shifts.some(({ schedule }) => schedule))
    )
      throw new HallError(
        "Nur Hallenbewirtung und Administratoren dürfen das Fest oder die Schichteinteilung ändern.",
      );
    const plan = await tx.hallPlan.findUnique({
      where: { id: input.id },
      include: {
        shifts: {
          include: {
            members: {
              select: {
                id: true,
                active: true,
                teams: { select: { teamId: true } },
              },
            },
          },
        },
        tasks: { select: { kind: true, helperNames: true } },
      },
    });
    if (!plan || plan.revision !== input.revision)
      throw new HallError(
        "Das Fest wurde zwischenzeitlich geändert. Bitte neu laden.",
      );

    const edits = new Map(input.shifts.map((edit) => [edit.id, edit]));
    if (
      edits.size !== input.shifts.length ||
      input.shifts.some(
        ({ id }) => !plan.shifts.some((shift) => shift.id === id),
      )
    )
      throw new HallError("Ungültige Schichtzuordnung.");
    const managedTeams = new Set(
      coordinator
        ? []
        : (
            await tx.hallTeamManager.findMany({
              where: { member: { userId: actorId, active: true } },
              select: { teamId: true },
            })
          ).map(({ teamId }) => teamId),
    );

    const newDay = input.day ?? plan.day;
    const dayDelta = calendarMillis(newDay) - calendarMillis(plan.day);
    const relocate = (instant: Date) =>
      shiftWallDay(dayOf(instant), dayDelta) + wallValue(instant).slice(10);
    const movedPlanTime = (instant: Date) =>
      dayDelta ? dutyTime(relocate(instant)) : instant;
    const oldPlanStart = movedPlanTime(plan.startsAt);
    const oldPlanEnd = movedPlanTime(plan.endsAt);

    const proposed = plan.shifts.map((shift) => {
      const edit = edits.get(shift.id);
      if (
        edit &&
        !coordinator &&
        (!shift.teamId || !managedTeams.has(shift.teamId))
      )
        throw new HallError("Für diese Schicht fehlt die Berechtigung.");
      const { start, end, teamId } = edit?.schedule ?? {
        start: wallValue(shift.startsAt).slice(11),
        end: wallValue(shift.endsAt).slice(11),
        teamId: shift.teamId,
      };
      const oldStart = wallValue(shift.startsAt);
      const oldEnd = wallValue(shift.endsAt);
      const clocksChanged =
        start !== oldStart.slice(11) || end !== oldEnd.slice(11);
      let times = { startsAt: shift.startsAt, endsAt: shift.endsAt };
      if (dayDelta || clocksChanged) {
        const startDay = relocate(shift.startsAt).slice(0, 10);
        const endDay =
          clocksChanged &&
          calendarMillis(oldEnd.slice(0, 10)) -
            calendarMillis(oldStart.slice(0, 10)) <=
            86400000 &&
          +shift.endsAt - +shift.startsAt < 24 * 3600000
            ? shiftWallDay(startDay, end < start ? 86400000 : 0)
            : relocate(shift.endsAt).slice(0, 10);
        times = dates(startDay + "T" + start, endDay + "T" + end);
      }
      const staffing = edit?.people ? staffingPeople(shift, edit.people) : null;
      const members = staffing
        ? shift.members.filter(({ id }) => !staffing.removed.includes(id))
        : shift.members;
      const helperNames = staffing?.helperNames ?? shift.helperNames;
      const changedPeople =
        !!staffing &&
        (staffing.removed.length > 0 ||
          JSON.stringify(helperNames) !== JSON.stringify(shift.helperNames));
      return {
        ...shift,
        ...times,
        teamId,
        members,
        helperNames,
        removed: staffing?.removed ?? [],
        changedPeople,
        moved:
          +times.startsAt !== +shift.startsAt ||
          +times.endsAt !== +shift.endsAt,
        changedTeam: teamId !== shift.teamId,
      };
    });

    let startsAt = oldPlanStart;
    let endsAt = oldPlanEnd;
    if (proposed.some(({ moved }) => moved)) {
      const first = Math.min(...proposed.map((shift) => +shift.startsAt));
      const last = Math.max(...proposed.map((shift) => +shift.endsAt));
      if (
        first < +startsAt ||
        plan.shifts.some((shift) => +shift.startsAt === +plan.startsAt)
      )
        startsAt = new Date(first);
      if (
        last > +endsAt ||
        plan.shifts.some((shift) => +shift.endsAt === +plan.endsAt)
      )
        endsAt = new Date(last);
    }
    const changes = proposed.filter(
      (shift) => shift.moved || shift.changedTeam || shift.changedPeople,
    );
    const planTimesChanged =
      dayDelta !== 0 ||
      +startsAt !== +plan.startsAt ||
      +endsAt !== +plan.endsAt;
    const taskNames = input.tasks;
    const tasksChanged =
      taskNames &&
      (["PURCHASE", "OPEN", "CLOSE"] as const).some(
        (kind) =>
          JSON.stringify(taskNames[kind].filter(Boolean)) !==
          JSON.stringify(
            plan.tasks.find((task) => task.kind === kind)?.helperNames ?? [],
          ),
      );
    if (!planTimesChanged && !changes.length && !tasksChanged) return;
    if (planTimesChanged) {
      if (endsAt <= startsAt || +endsAt - +startsAt > 36 * 3600000)
        throw new HallError("Das Fest muss zwischen 0 und 36 Stunden dauern.");
      if (
        await tx.hallPlan.findFirst({
          where: {
            id: { not: plan.id },
            venue: { equals: plan.venue, mode: "insensitive" },
            startsAt: { lt: endsAt },
            endsAt: { gt: startsAt },
          },
        })
      )
        throw new HallError(
          "Für diese Halle überschneidet sich bereits ein Plan.",
        );
    }

    const scheduleChanges = changes.filter(
      (shift) => shift.moved || shift.changedTeam,
    );
    if (scheduleChanges.length) {
      const teamIds = [
        ...new Set(
          scheduleChanges.flatMap((shift) =>
            shift.changedTeam && shift.teamId ? [shift.teamId] : [],
          ),
        ),
      ];
      if (
        (await tx.team.count({ where: { id: { in: teamIds } } })) !==
        teamIds.length
      )
        throw new HallError("Eine Mannschaft ist nicht mehr vorhanden.");
      const config = planOptions({ ...plan, day: newDay, endsAt });
      const { gte, lt } = windowFor(config);
      const window = {
        gte: new Date(Math.min(+gte, +startsAt - 3 * 86400000)),
        lt: new Date(Math.max(+lt, +endsAt + 4 * 86400000)),
      };
      const shiftIds = proposed.map(({ id }) => id);
      const [matches, fixed] = await Promise.all([
        tx.hallMatch.findMany({ where: { startsAt: window } }),
        fixedSlots(tx, window, shiftIds),
      ]);
      for (const shift of scheduleChanges) {
        const others = proposed.filter(({ id }) => id !== shift.id);
        if (shift.teamId) {
          const conflict = schedule(
            [{ ...shift, teamId: null, locked: false }],
            matches,
            { ...config, teamIds: [shift.teamId] },
            [...fixed, ...others],
          )[0]?.conflict;
          if (conflict) throw new HallError(conflict);
        }
        if (shift.moved) {
          await checkShiftMembers(
            tx,
            shift,
            config,
            matches,
            "Schicht",
            shiftIds,
          );
          if (
            others.some(
              (other) =>
                overlap(shift, other) &&
                shift.members.some(({ id }) =>
                  other.members.some((member) => member.id === id),
                ),
            )
          )
            throw new HallError(
              "Schicht: Ein Mitglied hat einen Zeitkonflikt.",
            );
        }
      }
    }

    for (const shift of changes) {
      await tx.hallShift.update({
        where: { id: shift.id },
        data: {
          staffingRevision: { increment: 1 },
          ...(shift.moved || shift.changedTeam
            ? {
                startsAt: shift.startsAt,
                endsAt: shift.endsAt,
                teamId: shift.teamId,
                conflict: "",
              }
            : {}),
          ...(shift.changedPeople
            ? {
                helperNames: shift.helperNames,
                members: { disconnect: shift.removed.map((id) => ({ id })) },
              }
            : {}),
        },
      });
    }
    if (tasksChanged) await writeHallTaskNames(tx, plan.id, taskNames);
    await tx.hallPlan.update({
      where: { id: plan.id },
      data: {
        revision: { increment: 1 },
        ...(planTimesChanged ? { day: newDay, startsAt, endsAt } : {}),
      },
    });
    await tx.auditLog.create({
      data: {
        actorId,
        action: "HALL_FEST_EDIT",
        entityType: "HallPlan",
        entityId: plan.id,
      },
    });
  });
}

function dates(start: string, end: string) {
  const startsAt = dutyTime(start),
    endsAt = dutyTime(end);
  if (endsAt <= startsAt || +endsAt - +startsAt > 36 * 3600000)
    throw new HallError(
      "Das Ende muss nach dem Beginn liegen. Maximal 36 Stunden.",
    );
  return { startsAt, endsAt };
}

export async function newPlan(tx: Tx, data: z.infer<typeof createPlanSchema>) {
  const { startsAt, endsAt } = dates(data.start, data.end);
  const existing = await tx.hallPlan.findFirst({
    where: {
      venue: { equals: data.venue, mode: "insensitive" },
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
    },
  });
  if (existing)
    throw new HallError("Für diese Halle überschneidet sich bereits ein Plan.");
  return tx.hallPlan.create({
    data: {
      title: data.title,
      venue: data.venue,
      notes: data.notes,
      day: dayOf(startsAt),
      startsAt,
      endsAt,
      shifts: {
        create: splitShifts(startsAt, endsAt, data.duration).map((slot) => ({
          ...slot,
          requiredHelpers: data.people,
        })),
      },
    },
    select: { id: true },
  });
}

export async function savePlan(tx: Tx, data: z.infer<typeof editPlanSchema>) {
  const plan = await tx.hallPlan.findUniqueOrThrow({
    where: { id: data.id },
    include: { shifts: { include: { members: { select: { id: true } } } } },
  });
  if (plan.publishedAt || plan.revision !== data.revision)
    throw new HallError(
      "Der Plan wurde veröffentlicht oder zwischenzeitlich geändert. Bitte neu laden.",
    );
  const period = dates(data.start, data.end);
  const duplicate = await tx.hallPlan.findFirst({
    where: {
      id: { not: plan.id },
      venue: { equals: data.venue, mode: "insensitive" },
      startsAt: { lt: period.endsAt },
      endsAt: { gt: period.startsAt },
    },
  });
  if (duplicate)
    throw new HallError("Für diese Halle überschneidet sich bereits ein Plan.");
  const shifts = data.shifts.map((shift) => ({
    ...shift,
    ...dates(shift.start, shift.end),
  }));
  const old = new Map(plan.shifts.map((shift) => [shift.id, shift]));
  const ids = shifts.flatMap(({ id }) => (id ? [id] : []));
  if (new Set(ids).size !== ids.length || ids.some((id) => !old.has(id)))
    throw new HallError("Ungültige Schichtzuordnung.");
  const members = await tx.member.findMany({
    where: {
      id: {
        in: [
          ...new Set([
            ...shifts.flatMap(({ memberIds }) => memberIds),
            ...Object.values(data.tasks).flat(),
          ]),
        ],
      },
    },
    select: { id: true, active: true, teams: { select: { teamId: true } } },
  });
  const people = new Map(members.map((member) => [member.id, member]));
  const blocks = optionsSchema.safeParse(plan.rules);
  const active = (id: string) =>
    people.get(id)?.active &&
    !(blocks.success && blocks.data.blockedMemberIds.includes(id));
  if (
    Object.values(data.tasks)
      .flat()
      .some((id) => !active(id))
  )
    throw new HallError(
      "Eine verantwortliche Person ist inaktiv oder gesperrt.",
    );
  const removed = plan.shifts.filter((shift) => !ids.includes(shift.id));
  if (removed.some((shift) => shift.locked))
    throw new HallError("Gesperrte Schichten zuerst entsperren.");
  for (const shift of shifts) {
    if (shift.startsAt < period.startsAt || shift.endsAt > period.endsAt)
      throw new HallError(
        "Alle Schichten müssen im Bewirtungszeitraum liegen.",
      );
    const previous = shift.id ? old.get(shift.id) : undefined;
    const unique = [...new Set(shift.memberIds)];
    const unchanged =
      previous &&
      previous.teamId === shift.teamId &&
      +previous.startsAt === +shift.startsAt &&
      +previous.endsAt === +shift.endsAt &&
      previous.requiredHelpers === shift.people &&
      previous.members.length === unique.length &&
      previous.members.every(({ id }) => unique.includes(id));
    if (previous?.locked && !unchanged)
      throw new HallError("Gesperrte Schichten zuerst entsperren.");
    if (
      !unchanged &&
      unique.some(
        (id) =>
          !active(id) ||
          (shift.teamId &&
            !previous?.members.some((member) => member.id === id) &&
            !people
              .get(id)
              ?.teams.some(({ teamId }) => teamId === shift.teamId)),
      )
    )
      throw new HallError(
        "Schichtmitglieder müssen aktiv, zugelassen und der gewählten Mannschaft zugeordnet sein.",
      );
    const helperNames = previous?.helperNames ?? [];
    const filledNames = helperNames.filter(Boolean);
    const available = Math.max(0, shift.people - unique.length);
    if (
      !unchanged &&
      (filledNames.length > available || unique.length > shift.people)
    )
      throw new HallError(
        "Die Schicht benötigt genügend Plätze für die bereits eingeteilten Personen.",
      );
    const overlapping = shifts.some(
      (other) =>
        other !== shift &&
        overlap(shift, other) &&
        ((shift.teamId !== null && other.teamId === shift.teamId) ||
          unique.some((id) => other.memberIds.includes(id))),
    );
    if (overlapping)
      throw new HallError(
        "Eine Mannschaft oder Person ist in überlappenden Schichten eingeteilt.",
      );
    const fields = {
      startsAt: shift.startsAt,
      endsAt: shift.endsAt,
      teamId: shift.teamId,
      requiredHelpers: shift.people,
      locked: shift.locked,
      conflict: unchanged ? previous.conflict : "",
    };
    if (shift.id)
      await tx.hallShift.update({
        where: { id: shift.id },
        data: {
          ...fields,
          helperNames:
            helperNames.length > available ? filledNames : helperNames,
          staffingRevision: { increment: 1 },
          members: { set: unique.map((id) => ({ id })) },
        },
      });
    else
      await tx.hallShift.create({
        data: {
          ...fields,
          planId: plan.id,
          members: { connect: unique.map((id) => ({ id })) },
        },
      });
  }
  if (removed.length)
    await tx.hallShift.deleteMany({
      where: { id: { in: removed.map(({ id }) => id) } },
    });
  for (const kind of ["PURCHASE", "OPEN", "CLOSE"] as const) {
    const members = [...new Set(data.tasks[kind])].map((id) => ({ id }));
    await tx.hallTask.upsert({
      where: { planId_kind: { planId: plan.id, kind } },
      create: { planId: plan.id, kind, members: { connect: members } },
      update: { members: { set: members } },
    });
  }
  await tx.hallPlan.update({
    where: { id: plan.id },
    data: {
      ...period,
      day: dayOf(period.startsAt),
      title: data.title,
      venue: data.venue,
      notes: data.notes,
      revision: { increment: 1 },
    },
  });
  return { id: plan.id };
}

export async function importMatches(tx: Tx, rows: ImportRow[]) {
  const teams = [...new Set(rows.map((row) => row.teamId))];
  if ((await tx.team.count({ where: { id: { in: teams } } })) !== teams.length)
    throw new HallError("Mindestens eine Mannschaft ist nicht mehr vorhanden.");
  const data = rows.map((row, index) => {
    try {
      return fixture(row);
    } catch {
      throw new HallError(`Zeile ${index + 1}: ungültige Spielzeit.`);
    }
  });
  const normalize = (value: string) =>
    value.normalize("NFKC").trim().toLocaleLowerCase("de").replace(/\s+/g, " ");
  const timingKey = (
    match: Pick<(typeof data)[number], "teamId" | "startsAt" | "home" | "away">,
  ) =>
    JSON.stringify([
      match.teamId,
      +match.startsAt,
      normalize(match.home),
      normalize(match.away),
    ]);
  const existing = await tx.hallMatch.findMany({
    where: {
      OR: [
        { sourceKey: { in: data.map(({ sourceKey }) => sourceKey) } },
        {
          teamId: { in: teams },
          startsAt: { in: data.map(({ startsAt }) => startsAt) },
        },
      ],
    },
    select: {
      sourceKey: true,
      teamId: true,
      startsAt: true,
      home: true,
      away: true,
    },
  });
  const keys = new Set(existing.map(({ sourceKey }) => sourceKey));
  const dates = new Set(existing.map(timingKey));
  const pending = data.filter((match) => {
    const dateKey = timingKey(match);
    if (keys.has(match.sourceKey) || dates.has(dateKey)) return false;
    keys.add(match.sourceKey);
    dates.add(dateKey);
    return true;
  });
  const { count: inserted } = await tx.hallMatch.createMany({
    data: pending,
    skipDuplicates: true,
  });
  const duplicates = rows.length - inserted;
  return { inserted, duplicates };
}

const windowFor = ({ from, to }: Pick<Options, "from" | "to">) => ({
  gte: new Date(+new Date(from) - 3 * 86400000),
  lt: new Date(+new Date(to) + 4 * 86400000),
});

async function fixedSlots(
  tx: Tx,
  window: ReturnType<typeof windowFor>,
  exceptIds: string[] = [],
): Promise<Slot[]> {
  const [hall, regular] = await Promise.all([
    tx.hallShift.findMany({
      where: {
        teamId: { not: null },
        startsAt: window,
        id: { notIn: exceptIds },
      },
    }),
    tx.dutyShift.findMany({
      where: {
        teamId: { not: null },
        startsAt: window,
        status: { not: "CANCELLED" },
      },
    }),
  ]);
  return [...hall, ...regular.map((slot) => ({ ...slot, locked: true }))];
}

export async function generateSeason(tx: Tx, options: Options) {
  const window = windowFor(options);
  const teams = await tx.team.findMany({ select: { id: true } });
  const teamIds = new Set(teams.map(({ id }) => id));
  if (options.teamIds.some((id) => !teamIds.has(id)))
    throw new HallError("Eine freigegebene Mannschaft existiert nicht mehr.");
  const matches = await tx.hallMatch.findMany({
    where: { startsAt: window },
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
  });
  const homes = new Map<string, typeof matches>();
  for (const match of matches) {
    const day = dayOf(match.startsAt);
    if (!match.ownHome || day < options.from || day > options.to) continue;
    const key = JSON.stringify([
      day,
      match.venue.trim().toLocaleLowerCase("de"),
    ]);
    const list = homes.get(key) ?? [];
    list.push(match);
    homes.set(key, list);
  }
  if (!homes.size)
    throw new HallError("Keine bestätigten Heimspiele im gewählten Zeitraum.");
  const plans = await tx.hallPlan.findMany({
    where: { day: { gte: options.from, lte: options.to } },
    include: { shifts: { include: { _count: { select: { members: true } } } } },
  });
  const rules = options as Prisma.InputJsonValue;
  const pending: Slot[] = [];
  const changed = new Set<string>();
  let skipped = 0;
  const newPlans: (Prisma.HallPlanCreateManyInput & {
    generatedKey: string;
    startsAt: Date;
    endsAt: Date;
  })[] = [];
  for (const [key, games] of homes) {
    const first = games[0];
    const day = dayOf(first.startsAt);
    const existing = plans.filter(
      (plan) =>
        plan.generatedKey === key ||
        (plan.day === day &&
          plan.venue.trim().toLocaleLowerCase("de") ===
            first.venue.trim().toLocaleLowerCase("de")),
    );
    if (existing.length) {
      for (const plan of existing) {
        if (plan.publishedAt) continue;
        const open = plan.shifts.filter(
          (shift) =>
            !shift.locked &&
            !shift.teamId &&
            !shift._count.members &&
            !shift.helperNames.some(Boolean),
        );
        if (open.length) {
          pending.push(...open);
          changed.add(plan.id);
        }
      }
      continue;
    }
    const startsAt = new Date(+first.startsAt - options.before * 60000);
    const endsAt = new Date(
      Math.max(...games.map(({ endsAt }) => +endsAt)) + options.after * 60000,
    );
    const blocked = [...plans, ...newPlans].some(
      (plan) =>
        plan.venue.trim().toLocaleLowerCase("de") ===
          first.venue.trim().toLocaleLowerCase("de") &&
        overlap({ startsAt, endsAt }, plan),
    );
    if (blocked) {
      skipped++;
      continue;
    }
    splitShifts(startsAt, endsAt, options.duration);
    newPlans.push({
      day,
      title: "Heimspieltag",
      venue: first.venue,
      startsAt,
      endsAt,
      generatedKey: key,
      rules,
    });
  }
  if (newPlans.length) {
    const created = await tx.hallPlan.createManyAndReturn({ data: newPlans });
    const slots = await tx.hallShift.createManyAndReturn({
      data: created.flatMap((plan) =>
        splitShifts(plan.startsAt, plan.endsAt, options.duration).map(
          (slot) => ({
            ...slot,
            planId: plan.id,
            requiredHelpers: options.people,
          }),
        ),
      ),
    });
    pending.push(...slots);
  }
  const results = schedule(
    pending,
    matches,
    options,
    await fixedSlots(tx, window),
  );
  const groups = new Map<
    string,
    { ids: string[]; teamId: string | null; conflict: string }
  >();
  for (const { id, teamId, conflict } of results) {
    const key = JSON.stringify([teamId, conflict]);
    const group = groups.get(key) ?? { ids: [], teamId, conflict };
    group.ids.push(id);
    groups.set(key, group);
  }
  for (const { ids, teamId, conflict } of groups.values())
    await tx.hallShift.updateMany({
      where: { id: { in: ids } },
      data: { teamId, conflict, staffingRevision: { increment: 1 } },
    });
  if (changed.size)
    await tx.hallPlan.updateMany({
      where: { id: { in: [...changed] } },
      data: { rules, revision: { increment: 1 } },
    });
  return {
    created: newPlans.length,
    skipped,
    assigned: results.filter((r) => r.teamId).length,
    unassigned: results.filter((r) => !r.teamId).length,
  };
}

function planOptions(plan: {
  rules: Prisma.JsonValue;
  day: string;
  endsAt: Date;
}): Options {
  const parsed = optionsSchema.safeParse(plan.rules);
  return parsed.success
    ? parsed.data
    : {
        from: plan.day,
        to: dayOf(plan.endsAt),
        before: 0,
        after: 0,
        duration: 120,
        people: 1,
        matchBefore: 0,
        matchAfter: 0,
        travel: 0,
        pause: 0,
        max: 500,
        teamIds: [],
        excluded: [],
        targets: {},
        blockedMemberIds: [],
        blocks: [],
        rules: [],
      };
}

async function checkShiftMembers(
  tx: Tx,
  shift: Slot & {
    members: { id: string; active: boolean; teams: { teamId: string }[] }[];
  },
  config: Options,
  matches: Match[],
  label = "Schicht",
  excludedShiftIds = [shift.id],
) {
  for (const member of shift.members) {
    if (!member.active || config.blockedMemberIds.includes(member.id))
      throw new HallError(`${label}: Inaktives oder gesperrtes Mitglied.`);
    const time = {
      startsAt: { lt: shift.endsAt },
      endsAt: { gt: shift.startsAt },
    };
    const [regular, other, unavailable] = await Promise.all([
      tx.dutyAssignment.findFirst({
        where: {
          memberId: member.id,
          shift: { ...time, status: { not: "CANCELLED" } },
        },
      }),
      tx.hallShift.findFirst({
        where: {
          ...time,
          id: { notIn: excludedShiftIds },
          members: { some: { id: member.id } },
        },
      }),
      tx.availability.findFirst({
        where: { ...time, memberId: member.id, available: false },
      }),
    ]);
    const plays = matches.some(
      (match) =>
        member.teams.some(({ teamId }) => teamId === match.teamId) &&
        overlap(
          shift,
          match,
          config.matchBefore + (match.ownHome ? 0 : config.travel),
          config.matchAfter + (match.ownHome ? 0 : config.travel),
        ),
    );
    if (regular || other || unavailable || plays)
      throw new HallError(`${label}: Ein Mitglied hat einen Zeitkonflikt.`);
  }
}

export async function publishPlan(
  tx: Tx,
  id: string,
  revision: number,
  publish: boolean,
) {
  const plan = await tx.hallPlan.findUniqueOrThrow({
    where: { id },
    include: {
      shifts: {
        include: {
          members: {
            select: {
              id: true,
              active: true,
              teams: { select: { teamId: true } },
            },
          },
        },
      },
      tasks: { include: { members: { select: { id: true, active: true } } } },
    },
  });
  if (plan.revision !== revision)
    throw new HallError(
      "Der Plan wurde zwischenzeitlich geändert. Bitte neu laden.",
    );
  if (Boolean(plan.publishedAt) === publish) return { id };
  if (publish) {
    const config = planOptions(plan);
    const window = windowFor(config);
    const [matches, fixed] = await Promise.all([
      tx.hallMatch.findMany({ where: { startsAt: window } }),
      fixedSlots(
        tx,
        window,
        plan.shifts.map(({ id }) => id),
      ),
    ]);
    const blocked = new Set(config.blockedMemberIds);
    if (
      plan.tasks.some((task) =>
        task.members.some((member) => !member.active || blocked.has(member.id)),
      )
    )
      throw new HallError(
        "Eine verantwortliche Person ist inaktiv oder gesperrt.",
      );
    for (const shift of plan.shifts) {
      const label = new Intl.DateTimeFormat("de-DE", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "Europe/Berlin",
      }).format(shift.startsAt);
      const checkTeam = (teamId: string) =>
        schedule(
          [{ ...shift, teamId: null, locked: false }],
          matches,
          { ...config, teamIds: [teamId], max: config.max },
          [...fixed, ...plan.shifts.filter(({ id }) => id !== shift.id)],
        )[0]?.conflict;
      if (shift.teamId) {
        const conflict = checkTeam(shift.teamId);
        if (conflict) throw new HallError(`${label}: ${conflict}.`);
      }
      await checkShiftMembers(tx, shift, config, matches, label);
    }
  }
  await tx.hallPlan.update({
    where: { id },
    data: {
      publishedAt: publish ? new Date() : null,
      revision: { increment: 1 },
    },
  });
  return { id };
}

export function hallPlanScope(
  teamIds: string[],
  mayViewPublished: boolean,
): Prisma.HallPlanWhereInput {
  return {
    OR: [
      ...(mayViewPublished ? [{ publishedAt: { not: null } }] : []),
      { shifts: { some: { teamId: { in: teamIds } } } },
    ],
  };
}
