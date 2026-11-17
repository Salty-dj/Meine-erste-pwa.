import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, test } from "vitest";
import { db } from "../../src/lib/db";
import {
  generateSeason,
  hallWrite,
  importMatches,
  hallPlanScope,
  newPlan,
  publishPlan,
  savePlan,
  saveHallManagers,
  saveHallTaskNames,
  saveShiftStaffing,
} from "../../src/lib/hall/service";
import { wallValue, type Options } from "../../src/lib/hall/planner";
import type { ImportRow } from "../../src/lib/hall/import";

if (
  !new URL(
    process.env.DATABASE_URL ?? "postgresql://localhost/invalid",
  ).pathname.endsWith("_test")
)
  throw new Error("Hallenbewirtung benötigt eine getrennte Testdatenbank.");

const key = randomUUID();
let hallId: string,
  helperId: string,
  memberId: string,
  ownTeam: string,
  otherTeam: string;
beforeAll(async () => {
  const hall = await db.user.create({
    data: {
      email: `hall-${key}@example.test`,
      name: "Halle",
      passwordHash: "unused",
      mustChangePassword: false,
      roles: { create: { roleId: "HALL_CATERING" } },
    },
  });
  const helper = await db.user.create({
    data: {
      email: `helper-${key}@example.test`,
      name: "Helfer",
      passwordHash: "unused",
      mustChangePassword: false,
      member: { create: { firstName: "Helfer", lastName: key } },
    },
    include: { member: true },
  });
  hallId = hall.id;
  helperId = helper.id;
  memberId = helper.member!.id;
  ownTeam = (
    await db.team.create({
      data: { name: `own-${key}`, members: { create: { memberId } } },
    })
  ).id;
  otherTeam = (await db.team.create({ data: { name: `other-${key}` } })).id;
});
afterAll(async () => {
  await db.$disconnect();
});

test("drafts are private; granted coordinator can save, lock and publish a manual plan", async () => {
  const start = "2085-01-13T10:00",
    end = "2085-01-13T16:00";
  const create = {
    start,
    end,
    title: "Manuell",
    venue: key,
    notes: "",
    people: 2,
    duration: 150,
  };
  await expect(
    hallWrite(helperId, (tx) => newPlan(tx, create)),
  ).rejects.toThrow("Zugriff");
  const { id } = await hallWrite(hallId, (tx) => newPlan(tx, create));
  const scope = hallPlanScope([], true);
  const draft = await db.hallPlan.findUniqueOrThrow({
    where: { id },
    include: { shifts: { orderBy: { startsAt: "asc" } } },
  });
  const changes = {
    id,
    revision: 0,
    start,
    end,
    title: draft.title,
    venue: draft.venue,
    notes: "",
    shifts: draft.shifts.map((shift, index) => ({
      id: shift.id,
      start: wallValue(shift.startsAt),
      end: wallValue(shift.endsAt),
      teamId: index === 0 ? ownTeam : null,
      memberIds: index === 0 ? [memberId] : [],
      people: 2,
      locked: index === 0,
    })),
    tasks: { PURCHASE: [memberId], OPEN: [], CLOSE: [] },
  };
  await hallWrite(hallId, (tx) => savePlan(tx, changes));
  expect(await db.hallPlan.count({ where: { id, AND: [scope] } })).toBe(0);
  await expect(
    hallWrite(hallId, (tx) =>
      savePlan(tx, {
        ...changes,
        revision: 1,
        shifts: changes.shifts.slice(1),
      }),
    ),
  ).rejects.toThrow("Gesperrte");
  await expect(
    hallWrite(hallId, (tx) => publishPlan(tx, id, 0, true)),
  ).rejects.toThrow("zwischenzeitlich");
  await hallWrite(hallId, (tx) => publishPlan(tx, id, 1, true));
  expect(await db.hallPlan.count({ where: { id, AND: [scope] } })).toBe(1);
  expect(
    await db.hallPlan.count({
      where: { id, AND: [hallPlanScope([otherTeam], true)] },
    }),
  ).toBe(1);
});

test("confirmed imports deduplicate and automatic replanning preserves assignments", async () => {
  const row: ImportRow = {
    date: "2085-02-11",
    time: "15:00",
    end: "16:30",
    home: "TSV",
    away: "Gast",
    venue: key,
    number: "123",
    teamLabel: "",
    teamId: ownTeam,
    ownHome: true,
  };
  const result = await hallWrite(hallId, (tx) =>
    importMatches(tx, [row, row, { ...row, number: "" }]),
  );
  expect(result).toEqual({ inserted: 1, duplicates: 2 });
  const config: Options = {
    from: "2085-02-01",
    to: "2085-02-28",
    before: 0,
    after: 0,
    duration: 90,
    people: 3,
    matchBefore: 0,
    matchAfter: 0,
    travel: 0,
    pause: 0,
    max: 10,
    teamIds: [ownTeam, otherTeam],
    excluded: [],
    targets: {},
    blocks: [],
    rules: [],
    blockedMemberIds: [],
  };
  expect(
    await hallWrite(hallId, (tx) => generateSeason(tx, config)),
  ).toMatchObject({ created: 1, assigned: 1 });
  const plans = await db.hallPlan.findMany({
    where: { day: row.date, venue: key },
    include: { shifts: true },
  });
  expect(plans).toHaveLength(1);
  expect(plans[0].shifts[0].teamId).toBe(otherTeam);
  expect(
    await hallWrite(hallId, (tx) =>
      generateSeason(tx, { ...config, excluded: [otherTeam] }),
    ),
  ).toMatchObject({ created: 0, assigned: 0 });
  expect(
    (
      await db.hallShift.findUniqueOrThrow({
        where: { id: plans[0].shifts[0].id },
      })
    ).teamId,
  ).toBe(otherTeam);
  await db.hallShift.update({
    where: { id: plans[0].shifts[0].id },
    data: { teamId: ownTeam },
  });
  await expect(
    hallWrite(hallId, (tx) => publishPlan(tx, plans[0].id, 0, true)),
  ).rejects.toThrow("Eigenes Spiel");
});

test("staffing is scoped to team managers and editable in place after publication", async () => {
  const admin = await db.user.create({
    data: {
      email: `staff-admin-${key}@example.test`,
      name: "Admin",
      passwordHash: "unused",
      mustChangePassword: false,
      roles: { create: { roleId: "CLUB_ADMIN" } },
    },
  });
  const second = await db.user.create({
    data: {
      email: `staff-manager-${key}@example.test`,
      name: "Zweite Person",
      passwordHash: "unused",
      mustChangePassword: false,
      member: { create: { firstName: "Zweite", lastName: key } },
    },
    include: { member: true },
  });
  const additionalId = second.member!.id;
  await expect(
    saveHallManagers(helperId, {
      id: ownTeam,
      memberIds: [memberId],
      previousMemberIds: [],
    }),
  ).rejects.toThrow("Zugriff");
  await saveHallManagers(admin.id, {
    id: ownTeam,
    memberIds: [memberId, additionalId],
    previousMemberIds: [],
  });
  await saveHallManagers(hallId, {
    id: otherTeam,
    memberIds: [additionalId],
    previousMemberIds: [],
  });
  expect(await db.hallTeamManager.count({ where: { teamId: ownTeam } })).toBe(
    2,
  );

  const { id } = await hallWrite(hallId, (tx) =>
    newPlan(tx, {
      start: "2085-03-15T10:00",
      end: "2085-03-15T14:00",
      duration: 120,
      title: "Fest",
      venue: key,
      notes: "",
      people: 3,
    }),
  );
  const [first, later] = await db.hallShift.findMany({
    where: { planId: id },
    orderBy: { startsAt: "asc" },
  });
  const editTeam = (
    actorId: string,
    shiftId: string,
    revision: number,
    teamId: string | null,
  ) =>
    saveShiftStaffing(actorId, { kind: "team", id: shiftId, revision, teamId });
  const editPeople = (
    actorId: string,
    shiftId: string,
    revision: number,
    names: string[],
    removedMemberIds: string[] = [],
  ) =>
    saveShiftStaffing(actorId, {
      kind: "people",
      id: shiftId,
      revision,
      names,
      removedMemberIds,
    });
  await expect(editPeople(helperId, first.id, 0, ["Gast"])).rejects.toThrow(
    "Berechtigung",
  );
  await editTeam(hallId, first.id, 0, ownTeam);
  await editTeam(admin.id, later.id, 0, otherTeam);
  await db.hallShift.update({
    where: { id: first.id },
    data: {
      locked: true,
      members: { connect: { id: memberId } },
    },
  });
  expect(
    await db.hallPlan.count({
      where: { id, AND: [hallPlanScope([ownTeam], true)] },
    }),
  ).toBe(1);
  expect(
    await db.hallPlan.count({ where: { id, AND: [hallPlanScope([], true)] } }),
  ).toBe(0);

  await expect(editTeam(helperId, first.id, 1, otherTeam)).rejects.toThrow(
    "dürfen Mannschaften",
  );
  await expect(editPeople(helperId, later.id, 1, ["Gast"])).rejects.toThrow(
    "Berechtigung",
  );
  await expect(
    editPeople(helperId, first.id, 1, ["A", "B", "C"]),
  ).rejects.toThrow("mehr Personen");
  await expect(
    editPeople(helperId, first.id, 1, [], [additionalId]),
  ).rejects.toThrow("nicht zugeteilt");
  await expect(
    hallWrite(helperId, (tx) => publishPlan(tx, id, 2, true)),
  ).rejects.toThrow("Zugriff");
  await hallWrite(hallId, (tx) => publishPlan(tx, id, 2, true));
  const before = await db.hallShift.findUniqueOrThrow({
    where: { id: later.id },
  });
  await editPeople(helperId, first.id, 1, ["", "Freier Name"]);
  await expect(
    editPeople(second.id, first.id, 1, ["Veraltet"]),
  ).rejects.toThrow("zwischenzeitlich");
  await editTeam(hallId, first.id, 2, otherTeam);
  expect(
    await db.hallShift.findUniqueOrThrow({
      where: { id: first.id },
      include: { members: { select: { id: true } } },
    }),
  ).toMatchObject({
    locked: true,
    teamId: otherTeam,
    helperNames: ["", "Freier Name"],
    members: [{ id: memberId }],
  });
  expect(
    await db.hallShift.findUniqueOrThrow({ where: { id: later.id } }),
  ).toEqual(before);
  await expect(editPeople(helperId, first.id, 3, [])).rejects.toThrow(
    "Berechtigung",
  );
  await editPeople(second.id, first.id, 3, ["Neuer Name"], [memberId]);
  await editTeam(admin.id, first.id, 4, null);
  await expect(editPeople(second.id, first.id, 5, [])).rejects.toThrow(
    "Berechtigung",
  );
  expect(
    await db.hallShift.findUniqueOrThrow({ where: { id: first.id } }),
  ).toMatchObject({
    teamId: null,
    helperNames: ["Neuer Name"],
    staffingRevision: 5,
  });
  expect(
    await db.hallPlan.count({ where: { id, AND: [hallPlanScope([], true)] } }),
  ).toBe(1);
  expect(
    await db.hallPlan.count({ where: { id, AND: [hallPlanScope([], false)] } }),
  ).toBe(0);
  await saveHallManagers(hallId, {
    id: otherTeam,
    memberIds: [],
    previousMemberIds: [additionalId],
  });
  await expect(editPeople(second.id, later.id, 1, [])).rejects.toThrow(
    "Berechtigung",
  );
});

test("a published plan keeps its assignments when time and task names are updated", async () => {
  const plan = await hallWrite(hallId, (tx) =>
    newPlan(tx, {
      start: "2085-08-15T09:00",
      end: "2085-08-15T13:00",
      duration: 120,
      title: "Veröffentlichtes Fest",
      venue: key,
      notes: "",
      people: 3,
    }),
  );
  await db.hallTask.create({
    data: {
      planId: plan.id,
      kind: "PURCHASE",
      members: { connect: { id: memberId } },
    },
  });
  await hallWrite(hallId, (tx) => publishPlan(tx, plan.id, 0, true));
  const [first, second] = await db.hallShift.findMany({
    where: { planId: plan.id },
    orderBy: { startsAt: "asc" },
  });
  await saveShiftStaffing(hallId, {
    kind: "team",
    id: first.id,
    revision: 0,
    teamId: ownTeam,
    times: { start: "2085-08-15T09:30", end: "2085-08-15T11:00" },
  });
  await hallWrite(hallId, (tx) =>
    saveHallTaskNames(tx, {
      id: plan.id,
      revision: 2,
      names: { PURCHASE: ["Kim"], OPEN: ["Alex"], CLOSE: ["Jan"] },
    }),
  );
  const current = await db.hallPlan.findUniqueOrThrow({
    where: { id: plan.id },
    include: {
      shifts: { orderBy: { startsAt: "asc" } },
      tasks: { include: { members: true } },
    },
  });
  expect(current.publishedAt).not.toBeNull();
  expect(wallValue(current.shifts[0].startsAt)).toBe("2085-08-15T09:30");
  expect(current.shifts[0].teamId).toBe(ownTeam);
  expect(current.shifts[1]).toEqual(second);
  expect(current.tasks).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        kind: "PURCHASE",
        helperNames: ["Kim"],
        members: [expect.objectContaining({ id: memberId })],
      }),
      expect.objectContaining({ kind: "OPEN", helperNames: ["Alex"] }),
      expect.objectContaining({ kind: "CLOSE", helperNames: ["Jan"] }),
    ]),
  );
});
