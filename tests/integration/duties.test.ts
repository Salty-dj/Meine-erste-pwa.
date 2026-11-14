import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, test } from "vitest";
import { db } from "../../src/lib/db";
import { dutyAccess, dutyScope, updateDuties } from "../../src/lib/duties";
import { dutyTime } from "../../src/lib/duty-input";

if (
  !new URL(
    process.env.DATABASE_URL ?? "postgresql://localhost/invalid",
  ).pathname.endsWith("_test")
)
  throw new Error("Die Diensttests benötigen eine getrennte Testdatenbank.");

const key = randomUUID();
const actor = (id: string, role: "MEMBER" | "TEAM_MANAGER" | "CLUB_ADMIN") => ({
  id,
  roles: [role],
});
let admin: ReturnType<typeof actor>;
let coach: ReturnType<typeof actor>;
let helper: ReturnType<typeof actor>;
let replacement: ReturnType<typeof actor>;
let substituteId: string;
let teamId: string;
let typeId: string;

beforeAll(async () => {
  const [organizer, manager, first, second] = await Promise.all(
    ["organizer", "coach", "first", "second"].map((name) =>
      db.user.create({
        data: {
          name,
          email: `${name}-${key}@example.test`,
          passwordHash: "unused",
          member: { create: { firstName: name, lastName: key } },
        },
        include: { member: true },
      }),
    ),
  );
  admin = actor(organizer.id, "CLUB_ADMIN");
  coach = actor(manager.id, "TEAM_MANAGER");
  helper = actor(first.id, "MEMBER");
  replacement = actor(second.id, "MEMBER");
  substituteId = second.member!.id;
  const team = await db.team.create({
    data: {
      name: key,
      managerId: manager.member!.id,
      members: {
        create: [{ memberId: first.member!.id }, { memberId: substituteId }],
      },
    },
  });
  teamId = team.id;
  typeId = (await db.dutyType.create({ data: { name: key } })).id;
});
afterAll(async () => {
  await db.$disconnect();
});

const dates = { startsAt: "2090-01-02T14:00", endsAt: "2090-01-02T16:00" };
const shiftInput = {
  operation: "shift",
  id: null,
  eventId: null,
  location: key,
  requiredHelpers: 1,
  occurrences: 1,
  voluntary: true,
  ...dates,
} as const;

test("concurrent self-signups reserve the last space once", async () => {
  await updateDuties(coach, { ...shiftInput, teamId, typeId });
  const shift = await db.dutyShift.findFirstOrThrow({
    where: { teamId, location: key },
  });
  const results = await Promise.allSettled([
    updateDuties(helper, {
      operation: "assign",
      shiftId: shift.id,
      memberId: null,
    }),
    updateDuties(replacement, {
      operation: "assign",
      shiftId: shift.id,
      memberId: null,
    }),
  ]);
  expect(
    results.filter((result) => result.status === "fulfilled"),
  ).toHaveLength(1);
  expect(await db.dutyAssignment.count({ where: { shiftId: shift.id } })).toBe(
    1,
  );
});

test("a team manager cannot create or see a foreign non-voluntary shift", async () => {
  const foreign = await db.team.create({ data: { name: `foreign-${key}` } });
  const input = { ...shiftInput, teamId: foreign.id, typeId, voluntary: false };
  await expect(updateDuties(coach, input)).rejects.toThrow("Berechtigung");
  await updateDuties(admin, input);
  const scope = dutyScope(await dutyAccess(db, coach));
  expect(
    await db.dutyShift.count({
      where: { AND: [scope, { teamId: foreign.id }] },
    }),
  ).toBe(0);
});

test("overlap blocks assignment and swap needs both target and coordinator", async () => {
  const interval = { startsAt: "2090-01-03T14:00", endsAt: "2090-01-03T16:00" };
  await updateDuties(coach, {
    ...shiftInput,
    teamId,
    typeId,
    ...interval,
    occurrences: 2,
  });
  const shifts = await db.dutyShift.findMany({
    where: { teamId, recurrenceGroup: { not: null } },
    orderBy: { startsAt: "asc" },
  });
  expect(shifts).toHaveLength(2);
  const shift = shifts[0];
  await updateDuties(helper, {
    operation: "assign",
    shiftId: shift.id,
    memberId: null,
  });
  await updateDuties(admin, {
    ...shiftInput,
    teamId: null,
    typeId,
    ...interval,
  });
  const overlapping = await db.dutyShift.findFirstOrThrow({
    where: { teamId: null, location: key },
  });
  await expect(
    updateDuties(helper, {
      operation: "assign",
      shiftId: overlapping.id,
      memberId: null,
    }),
  ).rejects.toThrow("Zeitkonflikt");
  const assignment = await db.dutyAssignment.findFirstOrThrow({
    where: { shiftId: shift.id },
  });
  await updateDuties(replacement, {
    operation: "availability",
    ...interval,
    available: false,
  });
  await expect(
    updateDuties(helper, {
      operation: "swap",
      assignmentId: assignment.id,
      memberId: substituteId,
    }),
  ).rejects.toThrow("Zeitkonflikt");
  await updateDuties(replacement, {
    operation: "availability",
    ...interval,
    available: true,
  });
  await updateDuties(helper, {
    operation: "swap",
    assignmentId: assignment.id,
    memberId: substituteId,
  });
  const swap = await db.dutySwapRequest.findFirstOrThrow({
    where: { assignmentId: assignment.id },
  });
  const accept = {
    operation: "swapDecision",
    swapId: swap.id,
    decision: "accept",
  } as const;
  await expect(updateDuties(coach, accept)).rejects.toThrow("Berechtigung");
  await updateDuties(replacement, accept);
  expect(
    (
      await db.dutyAssignment.findUniqueOrThrow({
        where: { id: assignment.id },
      })
    ).memberId,
  ).toBe(assignment.memberId);
  await updateDuties(coach, accept);
  expect(
    (
      await db.dutyAssignment.findUniqueOrThrow({
        where: { id: assignment.id },
      })
    ).memberId,
  ).toBe(substituteId);
  expect(
    (await db.dutySwapRequest.findUniqueOrThrow({ where: { id: swap.id } }))
      .status,
  ).toBe("APPROVED");
  await expect(updateDuties(coach, accept)).rejects.toThrow("erledigt");
});

test("weekly series preserve German local time across daylight saving", () => {
  expect(dutyTime("2026-03-22T14:00").toISOString()).toBe(
    "2026-03-22T13:00:00.000Z",
  );
  expect(dutyTime("2026-03-22T14:00", 1).toISOString()).toBe(
    "2026-03-29T12:00:00.000Z",
  );
  expect(() => dutyTime("2026-03-29T02:30")).toThrow("Zeitumstellung");
  expect(() => dutyTime("2026-10-25T02:30")).toThrow("Zeitumstellung");
});
