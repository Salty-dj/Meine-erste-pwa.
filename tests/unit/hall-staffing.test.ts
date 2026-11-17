import { beforeEach, expect, test, vi } from "vitest";
import {
  hallWrite,
  saveHallManagers,
  saveShiftStaffing,
  shiftStaffingSchema,
} from "../../src/lib/hall/service";

const db = vi.hoisted(() => ({ $transaction: vi.fn() }));
vi.mock("../../src/lib/db", () => ({ db }));

const tx = {
  $executeRaw: vi.fn(),
  user: { findUnique: vi.fn() },
  hallShift: { findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() },
  hallPlan: { update: vi.fn() },
  hallTeamManager: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    createMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  hallMatch: { findMany: vi.fn() },
  dutyShift: { findMany: vi.fn() },
  team: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn() },
  member: { count: vi.fn() },
  auditLog: { create: vi.fn() },
};
const shift = {
  id: "shift",
  teamId: "team",
  planId: "plan",
  staffingRevision: 0,
  requiredHelpers: 3,
  startsAt: new Date("2026-11-20T18:00:00Z"),
  endsAt: new Date("2026-11-20T20:00:00Z"),
  members: [{ id: "linked" }],
  locked: true,
  plan: {
    day: "2026-11-20",
    endsAt: new Date("2026-11-20T20:00:00Z"),
    rules: null,
    publishedAt: new Date(),
  },
};
const people = {
  kind: "people" as const,
  id: "shift",
  revision: 0,
  names: ["", "Gast"],
  removedMemberIds: [],
};
const team = {
  kind: "team" as const,
  id: "shift",
  revision: 0,
  teamId: "next",
};
const managers = {
  id: "team",
  previousMemberIds: ["existing"],
  memberIds: ["existing", "another"],
};
const actor = (roleId = "MEMBER", active = true, mustChangePassword = false) =>
  tx.user.findUnique.mockResolvedValue({
    active,
    mustChangePassword,
    roles: [{ roleId }],
  });

beforeEach(() => {
  vi.resetAllMocks();
  db.$transaction.mockImplementation((work) => work(tx));
  actor();
  tx.hallShift.findUnique.mockResolvedValue(shift);
  tx.team.findUnique.mockResolvedValue({ id: "next" });
  tx.hallShift.findMany.mockResolvedValue([]);
  tx.dutyShift.findMany.mockResolvedValue([]);
  tx.hallMatch.findMany.mockResolvedValue([]);
});

test("accepts sparse free names and rejects injected permissions and invalid input", () => {
  expect(
    shiftStaffingSchema.parse({ ...people, names: ["", "  Gast  "] }),
  ).toMatchObject({ names: ["", "Gast"] });
  expect(
    shiftStaffingSchema.safeParse({ ...people, teamId: "next" }).success,
  ).toBe(false);
  expect(
    shiftStaffingSchema.safeParse({ ...people, names: ["Gast\u0000"] }).success,
  ).toBe(false);
  expect(
    shiftStaffingSchema.safeParse({ ...people, names: ["x".repeat(161)] })
      .success,
  ).toBe(false);
});

test("membership in the assigned team alone grants no editing permissions", async () => {
  tx.hallTeamManager.findFirst.mockResolvedValue(null);
  await expect(saveShiftStaffing("member", people)).rejects.toThrow(
    "Berechtigung",
  );
  expect(tx.hallTeamManager.findFirst).toHaveBeenCalledWith({
    where: { teamId: "team", member: { userId: "member", active: true } },
    select: { memberId: true },
  });
  expect(tx.hallShift.update).not.toHaveBeenCalled();
});

test("a team manager edits only people and cannot use coordinator actions", async () => {
  tx.hallTeamManager.findFirst.mockResolvedValue({ memberId: "manager" });
  await expect(saveShiftStaffing("manager", team)).rejects.toThrow(
    "Mannschaften ändern",
  );
  await expect(saveHallManagers("manager", managers)).rejects.toThrow(
    "Zugriff",
  );
  await expect(hallWrite("manager", vi.fn())).rejects.toThrow("Zugriff");
  await saveShiftStaffing("manager", people);
  expect(tx.hallShift.update).toHaveBeenCalledOnce();
  expect(tx.hallShift.update).toHaveBeenCalledWith({
    where: { id: "shift" },
    data: {
      helperNames: ["", "Gast"],
      members: { disconnect: [] },
      staffingRevision: { increment: 1 },
    },
  });
});

test.each(["HALL_CATERING", "CLUB_ADMIN", "SUPERADMIN"])(
  "%s can change a published shift without overwriting its people or other shifts",
  async (role) => {
    actor(role);
    await saveShiftStaffing("coordinator", team);
    expect(tx.hallShift.update).toHaveBeenCalledWith({
      where: { id: "shift" },
      data: {
        team: { connect: { id: "next" } },
        conflict: "",
        staffingRevision: { increment: 1 },
      },
    });
    await saveShiftStaffing("coordinator", { ...team, teamId: null });
    expect(tx.hallShift.update).toHaveBeenLastCalledWith({
      where: { id: "shift" },
      data: {
        team: { disconnect: true },
        conflict: "",
        staffingRevision: { increment: 1 },
      },
    });
  },
);

test("rejects scheduling conflicts in the inline team form", async () => {
  actor("HALL_CATERING");
  tx.hallMatch.findMany.mockResolvedValue([
    {
      teamId: "next",
      startsAt: shift.startsAt,
      endsAt: shift.endsAt,
      ownHome: true,
    },
  ]);
  await expect(saveShiftStaffing("hall", team)).rejects.toThrow(
    "Eigenes Spiel",
  );
  expect(tx.hallShift.update).not.toHaveBeenCalled();
});

test("rejects stale edits, overbooking and removal of arbitrary linked members", async () => {
  actor("HALL_CATERING");
  await expect(
    saveShiftStaffing("hall", { ...people, revision: 1 }),
  ).rejects.toThrow("zwischenzeitlich");
  await expect(
    saveShiftStaffing("hall", { ...people, names: ["A", "B", "C"] }),
  ).rejects.toThrow("mehr Personen");
  await expect(
    saveShiftStaffing("hall", { ...people, removedMemberIds: ["unrelated"] }),
  ).rejects.toThrow("nicht zugeteilt");
  await saveShiftStaffing("hall", {
    ...people,
    names: ["A", "B", "C"],
    removedMemberIds: ["linked"],
  });
  expect(tx.hallShift.update).toHaveBeenCalledOnce();
  expect(tx.hallShift.update.mock.calls[0][0].data.members.disconnect).toEqual([
    { id: "linked" },
  ]);
});

test("an inactive user or a user with a password reset requirement cannot edit", async () => {
  actor("HALL_CATERING", false);
  await expect(saveShiftStaffing("hall", people)).rejects.toThrow("Zugriff");
  actor("CLUB_ADMIN", true, true);
  await expect(saveShiftStaffing("admin", people)).rejects.toThrow("Zugriff");
  expect(tx.hallShift.findUnique).not.toHaveBeenCalled();
});

test("coordinators can add several team managers and stale selections cannot overwrite them", async () => {
  actor("HALL_CATERING");
  tx.hallTeamManager.findMany.mockResolvedValue([{ memberId: "existing" }]);
  tx.member.count.mockResolvedValue(1);
  await expect(
    saveHallManagers("hall", { ...managers, previousMemberIds: [] }),
  ).rejects.toThrow("zwischenzeitlich");
  await saveHallManagers("hall", managers);
  expect(tx.hallTeamManager.createMany).toHaveBeenCalledWith({
    data: [{ teamId: "team", memberId: "another" }],
  });
  expect(tx.hallTeamManager.deleteMany).not.toHaveBeenCalled();
});
