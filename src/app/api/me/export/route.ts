import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
export const dynamic = "force-dynamic";
export async function GET() {
  const user = await currentUser();
  if (!user || user.mustChangePassword)
    return new Response("Nicht angemeldet", { status: 401 });
  const profile = await db.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
      roles: { select: { role: { select: { id: true, label: true } } } },
      member: {
        include: {
          teams: {
            include: { team: { select: { name: true, ageGroup: true } } },
          },
          availability: true,
          assignments: { include: { shift: { include: { type: true } } } },
        },
      },
      notifications: true,
      tasks: true,
    },
  });
  await db.auditLog.create({
    data: {
      actorId: user.id,
      action: "PERSONAL_DATA_EXPORTED",
      entityType: "User",
      entityId: user.id,
    },
  });
  return Response.json(
    { exportedAt: new Date().toISOString(), profile },
    {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": 'attachment; filename="tsv-meine-daten.json"',
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
