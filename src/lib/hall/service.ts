import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "../db";
import { dutyTime } from "../duty-input";
import { can } from "../roles";
import { fixture, importRowSchema, type ImportRow } from "./import";
import {
  dayOf,
  optionsSchema,
  overlap,
  schedule,
  splitShifts,
  wall,
  type Options,
  type Slot,
} from "./planner";

const id = z.string().min(1).max(100);
const name = z.string().trim().min(1).max(160);
const people = z.number().int().min(1).max(100);
const memberIds = z.array(id).max(100);
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
export class HallError extends Error {}
type Tx = Prisma.TransactionClient;

export function hallWrite<T>(
  actorId: string,
  operation: (tx: Tx) => Promise<T>,
) {
  return db.$transaction(
    async (tx) => {
      // Share the lock with ordinary duty planning for cross-module conflict checks.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(14072002)`;
      const actor = await tx.user.findUnique({
        where: { id: actorId },
        include: { roles: true },
      });
      if (
        !actor?.active ||
        actor.mustChangePassword ||
        !can(
          actor.roles.map((role) => role.roleId),
          "hall",
        )
      )
        throw new HallError("Zugriff nicht erlaubt.");
      return operation(tx);
    },
    { isolationLevel: "ReadCommitted", maxWait: 8000, timeout: 30000 },
  );
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
            !people
              .get(id)
              ?.teams.some(({ teamId }) => teamId === shift.teamId)),
      )
    )
      throw new HallError(
        "Schichtmitglieder müssen aktiv, zugelassen und der gewählten Mannschaft zugeordnet sein.",
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
        data: { ...fields, members: { set: unique.map((id) => ({ id })) } },
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
          (shift) => !shift.locked && !shift.teamId && !shift._count.members,
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
      data: { teamId, conflict },
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
    const parsed = optionsSchema.safeParse(plan.rules);
    const config: Options = parsed.success
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
      for (const member of shift.members) {
        if (
          !member.active ||
          blocked.has(member.id) ||
          (shift.teamId &&
            !member.teams.some(({ teamId }) => teamId === shift.teamId))
        )
          throw new HallError(
            `${label}: Inaktives, gesperrtes oder nicht zugehöriges Mitglied.`,
          );
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
              id: { not: shift.id },
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

export function memberPlanScope(
  memberId: string,
  teamIds: string[],
): Prisma.HallPlanWhereInput {
  return {
    publishedAt: { not: null },
    OR: [
      {
        shifts: {
          some: {
            OR: [
              { teamId: { in: teamIds } },
              { members: { some: { id: memberId } } },
            ],
          },
        },
      },
      { tasks: { some: { members: { some: { id: memberId } } } } },
    ],
  };
}
