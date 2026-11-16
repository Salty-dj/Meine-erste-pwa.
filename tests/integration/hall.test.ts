import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, test } from "vitest";
import { db } from "../../src/lib/db";
import {
  generateSeason,
  hallWrite,
  importMatches,
  memberPlanScope,
  newPlan,
  publishPlan,
  savePlan,
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
  const scope = memberPlanScope(memberId, [ownTeam]);
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
      where: { id, AND: [memberPlanScope("another", [])] },
    }),
  ).toBe(0);
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
