import { db } from "./db";
import { can } from "./roles";
import type { sessionUser } from "./auth-service";
type User = NonNullable<Awaited<ReturnType<typeof sessionUser>>>;
export async function getDashboard(user: User) {
  const now = new Date();
  const club = can(user.roles, "club");
  const stock = can(user.roles, "stock");
  const finance = can(user.roles, "finance");
  const member = await db.member.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });
  const taskWhere = club
    ? { status: { not: "DONE" as const } }
    : { assigneeId: user.id, status: { not: "DONE" as const } };
  const [
    events,
    assignments,
    openTasks,
    taskCount,
    notifications,
    shiftTotals,
    stockRows,
    financeTotal,
    teamHours,
  ] = await Promise.all([
    db.event.findMany({
      where: { endsAt: { gte: now } },
      orderBy: { startsAt: "asc" },
      take: 4,
      select: {
        id: true,
        title: true,
        type: true,
        startsAt: true,
        location: true,
      },
    }),
    member
      ? db.dutyAssignment.findMany({
          where: {
            memberId: member.id,
            shift: { endsAt: { gte: now }, status: "PLANNED" },
          },
          include: { shift: { include: { type: true } } },
          orderBy: { shift: { startsAt: "asc" } },
          take: 4,
        })
      : Promise.resolve([]),
    db.task.findMany({
      where: taskWhere,
      orderBy: [{ highPriority: "desc" }, { dueAt: "asc" }],
      take: 4,
      select: { id: true, title: true, dueAt: true, highPriority: true },
    }),
    db.task.count({ where: taskWhere }),
    db.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 4,
      select: {
        id: true,
        title: true,
        body: true,
        createdAt: true,
        readAt: true,
      },
    }),
    db.dutyShift.findMany({
      where: {
        status: "PLANNED",
        endsAt: { gte: now },
        ...(club ? {} : { voluntary: true }),
      },
      select: {
        requiredHelpers: true,
        _count: { select: { assignments: true } },
      },
    }),
    stock
      ? db.product.findMany({
          where: { archived: false },
          select: {
            id: true,
            name: true,
            unit: true,
            minimumStock: true,
            purchasePriceCents: true,
            movements: { select: { quantity: true } },
          },
        })
      : Promise.resolve([]),
    finance
      ? db.financeTransaction.aggregate({ _sum: { amountCents: true } })
      : Promise.resolve(null),
    can(user.roles, "team")
      ? db.team.findMany({
          where: club ? {} : { manager: { userId: user.id } },
          select: {
            name: true,
            members: {
              select: {
                member: {
                  select: {
                    assignments: {
                      where: { shift: { status: "COMPLETED" } },
                      select: { actualMinutes: true, shiftId: true },
                    },
                  },
                },
              },
            },
          },
        })
      : Promise.resolve([]),
  ]);
  const products = stockRows.map((p) => ({
    ...p,
    quantity: p.movements.reduce((sum, m) => sum + m.quantity, 0),
  }));
  const needed = shiftTotals.reduce((n, s) => n + s.requiredHelpers, 0);
  const assigned = shiftTotals.reduce(
    (n, s) => n + Math.min(s.requiredHelpers, s._count.assignments),
    0,
  );
  return {
    events,
    assignments,
    openTasks,
    taskCount,
    notifications,
    openPositions: needed - assigned,
    coverage: needed ? Math.round((assigned / needed) * 100) : null,
    stockWarnings: products.filter((p) => p.quantity < p.minimumStock),
    stockValueCents: products.reduce(
      (n, p) => n + p.quantity * p.purchasePriceCents,
      0,
    ),
    financeCents: financeTotal?._sum.amountCents ?? 0,
    teamHours: teamHours.map((t) => ({
      name: t.name,
      hours:
        t.members.reduce(
          (n, m) =>
            n +
            m.member.assignments.reduce(
              (a, d) => a + (d.actualMinutes ?? 0),
              0,
            ),
          0,
        ) / 60,
    })),
    club,
    stock,
    finance,
  };
}
