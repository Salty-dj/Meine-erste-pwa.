import { randomUUID } from "node:crypto";
import type { Prisma, RoleCode } from "@prisma/client";
import { db } from "./db";
import { can } from "./roles";
import { dutyInterval, DutyError, type DutyInput } from "./duty-input";

type Actor = { id: string; roles: readonly RoleCode[] };
type Tx = Prisma.TransactionClient;
type Shift = Prisma.DutyShiftGetPayload<{ include: { type: true } }>;
const pendingSwaps = ["REQUESTED", "TARGET_APPROVED"];

export async function dutyAccess(tx: Tx, actor: Actor) {
  const club = can(actor.roles, "club");
  const member = await tx.member.findUnique({
    where: { userId: actor.id },
    select: {
      id: true,
      active: true,
      teams: { select: { teamId: true } },
      managedTeams: { select: { id: true } },
    },
  });
  const active = member?.active ? member : null;
  const managed = can(actor.roles, "team")
    ? (active?.managedTeams.map(({ id }) => id) ?? [])
    : [];
  const teams = active?.teams.map(({ teamId }) => teamId) ?? [];
  return { club, managed, teams, memberId: active?.id };
}
type Access = Awaited<ReturnType<typeof dutyAccess>>;

export function dutyScope(access: Access): Prisma.DutyShiftWhereInput {
  if (access.club) return {};
  return {
    OR: [
      { teamId: { in: access.managed } },
      {
        voluntary: true,
        OR: [{ teamId: null }, { teamId: { in: access.teams } }],
      },
      ...(access.memberId
        ? [{ assignments: { some: { memberId: access.memberId } } }]
        : []),
    ],
  };
}

function assertAllowed(allowed: unknown): asserts allowed {
  if (!allowed) throw new DutyError("Für diese Aktion fehlt die Berechtigung.");
}

export function managesShift(access: Access, teamId: string | null) {
  return access.club || (teamId !== null && access.managed.includes(teamId));
}

async function getShift(tx: Tx, id: string) {
  const shift = await tx.dutyShift.findUnique({
    where: { id },
    include: { type: true },
  });
  if (!shift) throw new DutyError("Der Dienst wurde nicht gefunden.");
  return shift;
}

async function eligible(tx: Tx, memberId: string, shift: Shift) {
  const member = await tx.member.findUnique({
    where: { id: memberId },
    select: { active: true, userId: true, teams: { select: { teamId: true } } },
  });
  if (
    !member?.active ||
    (shift.teamId &&
      !member.teams.some(({ teamId }) => teamId === shift.teamId))
  )
    throw new DutyError(
      "Die Person ist für diesen Dienst nicht verfügbar oder der Mannschaft nicht zugeordnet.",
    );

  const time = {
    startsAt: { lt: shift.endsAt },
    endsAt: { gt: shift.startsAt },
  };
  const conflict = await tx.dutyAssignment.findFirst({
    where: {
      memberId,
      OR: [{ shiftId: shift.id }, { shift: { status: "PLANNED", ...time } }],
    },
    select: { id: true },
  });
  const unavailable = await tx.availability.findFirst({
    where: { memberId, available: false, ...time },
    select: { id: true },
  });
  if (conflict || unavailable)
    throw new DutyError(
      "Die Person ist bereits eingeteilt oder hat einen Zeitkonflikt.",
    );
  return member;
}

function upcoming(shift: Shift) {
  if (shift.status !== "PLANNED" || shift.startsAt <= new Date())
    throw new DutyError(
      "Dieser Dienst ist nicht mehr für Änderungen geöffnet.",
    );
}

async function notify(
  tx: Tx,
  userId: string | null,
  title: string,
  body: string,
) {
  if (userId)
    await tx.notification.create({
      data: { userId, type: "DUTY", title, body },
    });
}

async function saveMember(
  tx: Tx,
  input: Extract<DutyInput, { operation: "member" }>,
) {
  const { id, teamIds, email, phone, qualifications, ...fields } = input;
  const { operation: _operation, ...profile } = fields;
  void _operation;
  const data = {
    ...profile,
    email: email || null,
    phone: phone || null,
    qualifications: [
      ...new Set(
        qualifications
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    ],
  };
  const member = id
    ? await tx.member.update({ where: { id }, data })
    : await tx.member.create({ data });
  await tx.teamMember.deleteMany({
    where: { memberId: member.id, teamId: { notIn: teamIds } },
  });
  await tx.teamMember.createMany({
    data: [...new Set(teamIds)].map((teamId) => ({
      memberId: member.id,
      teamId,
    })),
    skipDuplicates: true,
  });
  return member.id;
}

async function saveShift(
  tx: Tx,
  access: Access,
  input: Extract<DutyInput, { operation: "shift" }>,
) {
  assertAllowed(managesShift(access, input.teamId));
  const { typeId, teamId, eventId, location, requiredHelpers, voluntary } =
    input;
  const data = {
    typeId,
    teamId,
    eventId,
    location,
    requiredHelpers,
    voluntary,
  };
  if (!input.id) {
    const recurrenceGroup = input.occurrences > 1 ? randomUUID() : null;
    const shifts = await tx.dutyShift.createManyAndReturn({
      data: Array.from({ length: input.occurrences }, (_, week) => ({
        ...data,
        ...dutyInterval(input, week),
        recurrenceGroup,
      })),
      select: { id: true },
    });
    return shifts.map(({ id }) => id).join(",");
  }
  const shift = await getShift(tx, input.id);
  assertAllowed(managesShift(access, shift.teamId));
  upcoming(shift);
  const dates = dutyInterval(input);
  const assignments = await tx.dutyAssignment.count({
    where: { shiftId: shift.id },
  });
  if (
    assignments &&
    (teamId !== shift.teamId ||
      +dates.startsAt !== +shift.startsAt ||
      +dates.endsAt !== +shift.endsAt ||
      requiredHelpers < assignments)
  )
    throw new DutyError(
      "Bei besetzten Diensten müssen Zeit, Mannschaft und genügend Plätze erhalten bleiben.",
    );
  return (
    await tx.dutyShift.update({
      where: { id: shift.id },
      data: { ...data, ...dates },
    })
  ).id;
}

async function recordDuty(tx: Tx, access: Access, input: DutyInput) {
  switch (input.operation) {
    case "member":
      assertAllowed(access.club);
      return saveMember(tx, input);
    case "team": {
      assertAllowed(access.club);
      const data = {
        name: input.name,
        ageGroup: input.ageGroup || null,
        managerId: input.managerId,
      };
      return (
        input.id
          ? await tx.team.update({ where: { id: input.id }, data })
          : await tx.team.create({ data })
      ).id;
    }
    case "type":
      assertAllowed(access.club);
      return (await tx.dutyType.create({ data: { name: input.name } })).id;
    case "shift":
      return saveShift(tx, access, input);
    case "assign": {
      const shift = await getShift(tx, input.shiftId);
      upcoming(shift);
      const memberId = input.memberId ?? access.memberId;
      assertAllowed(
        memberId &&
          (input.memberId
            ? managesShift(access, shift.teamId)
            : shift.voluntary &&
              (!shift.teamId || access.teams.includes(shift.teamId))),
      );
      if (
        (await tx.dutyAssignment.count({ where: { shiftId: shift.id } })) >=
        shift.requiredHelpers
      )
        throw new DutyError(
          "Alle Plätze für diesen Dienst sind bereits belegt.",
        );
      const member = await eligible(tx, memberId, shift);
      const assignment = await tx.dutyAssignment.create({
        data: { shiftId: shift.id, memberId },
      });
      await notify(tx, member.userId, "Dienst eingetragen", shift.type.name);
      return assignment.id;
    }
    case "minutes": {
      const assignment = await tx.dutyAssignment.findUniqueOrThrow({
        where: { id: input.assignmentId },
        include: { shift: true },
      });
      assertAllowed(managesShift(access, assignment.shift.teamId));
      if (
        assignment.shift.status === "CANCELLED" ||
        assignment.shift.endsAt > new Date()
      )
        throw new DutyError(
          "Stunden können erst nach Ende eines stattgefundenen Dienstes erfasst werden.",
        );
      return (
        await tx.dutyAssignment.update({
          where: { id: assignment.id },
          data: { actualMinutes: input.minutes },
        })
      ).id;
    }
    case "shiftStatus": {
      const shift = await getShift(tx, input.shiftId);
      assertAllowed(managesShift(access, shift.teamId));
      if (shift.status !== "PLANNED")
        throw new DutyError(
          "Der Dienst ist bereits abgeschlossen oder abgesagt.",
        );
      if (input.status === "COMPLETED" && shift.endsAt > new Date())
        throw new DutyError(
          "Ein Dienst kann erst nach seinem Ende abgeschlossen werden.",
        );
      await tx.dutySwapRequest.updateMany({
        where: {
          assignment: { shiftId: shift.id },
          status: { in: pendingSwaps },
        },
        data: { status: "DECLINED" },
      });
      if (input.status === "CANCELLED") {
        const assignments = await tx.dutyAssignment.findMany({
          where: { shiftId: shift.id },
          select: { member: { select: { userId: true } } },
        });
        for (const { member } of assignments)
          await notify(tx, member.userId, "Dienst abgesagt", shift.type.name);
      }
      return (
        await tx.dutyShift.update({
          where: { id: shift.id },
          data: { status: input.status },
        })
      ).id;
    }
    case "availability": {
      assertAllowed(access.memberId);
      const time = dutyInterval(input);
      if (time.endsAt <= new Date())
        throw new DutyError("Die Verfügbarkeit muss in der Zukunft liegen.");
      const existing = await tx.availability.findFirst({
        where: { memberId: access.memberId, ...time },
        orderBy: { id: "asc" },
      });
      if (existing)
        return (
          await tx.availability.update({
            where: { id: existing.id },
            data: { available: input.available },
          })
        ).id;
      return (
        await tx.availability.create({
          data: {
            ...time,
            memberId: access.memberId,
            available: input.available,
          },
        })
      ).id;
    }
    case "swap": {
      const assignment = await tx.dutyAssignment.findUniqueOrThrow({
        where: { id: input.assignmentId },
        include: { shift: { include: { type: true } } },
      });
      assertAllowed(assignment.memberId === access.memberId);
      upcoming(assignment.shift);
      const target = await eligible(tx, input.memberId, assignment.shift);
      if (!target.userId)
        throw new DutyError(
          "Das Mitglied braucht ein Benutzerkonto für die Zustimmung.",
        );
      if (
        await tx.dutySwapRequest.findFirst({
          where: { assignmentId: assignment.id, status: { in: pendingSwaps } },
          select: { id: true },
        })
      )
        throw new DutyError(
          "Für diesen Dienst gibt es bereits eine offene Tauschanfrage.",
        );
      const swap = await tx.dutySwapRequest.create({
        data: {
          assignmentId: assignment.id,
          targetMemberId: input.memberId,
          requesterApprovedAt: new Date(),
        },
      });
      await notify(
        tx,
        target.userId,
        "Neue Diensttauschanfrage",
        assignment.shift.type.name,
      );
      return swap.id;
    }
    case "swapDecision": {
      const swap = await tx.dutySwapRequest.findUniqueOrThrow({
        where: { id: input.swapId },
        include: {
          assignment: {
            include: {
              shift: { include: { type: true } },
              member: { select: { userId: true } },
            },
          },
          targetMember: { select: { userId: true } },
        },
      });
      const { assignment } = swap;
      const { shift } = assignment;
      const target = access.memberId === swap.targetMemberId;
      const coordinator = managesShift(access, shift.teamId);
      const owner = access.memberId === assignment.memberId;
      if (!pendingSwaps.includes(swap.status))
        throw new DutyError("Diese Anfrage ist bereits erledigt.");
      if (input.decision === "decline") {
        assertAllowed(target || coordinator || owner);
        await tx.dutySwapRequest.update({
          where: { id: swap.id },
          data: { status: "DECLINED" },
        });
        await notify(
          tx,
          owner ? swap.targetMember.userId : assignment.member.userId,
          "Diensttausch beendet",
          shift.type.name,
        );
        return swap.id;
      }
      upcoming(shift);
      assertAllowed(swap.requesterApprovedAt);
      await eligible(tx, swap.targetMemberId, shift);
      const now = new Date();
      if (swap.status === "REQUESTED") {
        assertAllowed(target);
        await tx.dutySwapRequest.update({
          where: { id: swap.id },
          data: { status: "TARGET_APPROVED", targetApprovedAt: now },
        });
      } else {
        assertAllowed(coordinator && swap.targetApprovedAt);
        await tx.dutyAssignment.update({
          where: { id: assignment.id },
          data: { memberId: swap.targetMemberId },
        });
        await tx.dutySwapRequest.update({
          where: { id: swap.id },
          data: { status: "APPROVED", coordinatorApprovedAt: now },
        });
        await notify(
          tx,
          assignment.member.userId,
          "Diensttausch bestätigt",
          shift.type.name,
        );
        await notify(
          tx,
          swap.targetMember.userId,
          "Diensttausch bestätigt",
          shift.type.name,
        );
      }
      return swap.id;
    }
  }
}

export function updateDuties(actor: Actor, input: DutyInput) {
  return db.$transaction(
    async (tx) => {
      // Serialize checks and changes across instances, including overlapping shifts.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(14072002)`;
      const access = await dutyAccess(tx, actor);
      const entityId = await recordDuty(tx, access, input);
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: input.operation.toUpperCase(),
          entityType: "DutyPlanning",
          entityId,
        },
      });
    },
    { isolationLevel: "ReadCommitted", maxWait: 5000, timeout: 15000 },
  );
}
