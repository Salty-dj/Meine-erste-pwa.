import { Plus, ShieldCheck, Users } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { CreateUserForm, RolesForm } from "@/components/forms";
import { roleLabels } from "@/lib/roles";
export const metadata = { title: "Benutzer & Rollen" };
export default async function UsersPage() {
  await requirePermission("accounts");
  const users = await db.user.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      active: true,
      mustChangePassword: true,
      roles: { select: { roleId: true } },
    },
    take: 200,
  });
  return (
    <>
      <div className="page-intro">
        <div>
          <span className="section-kicker">SUPERADMINISTRATION</span>
          <h1>Ein Team. Klare Zugänge.</h1>
          <p>
            Persönliche Benutzerkonten und serverseitig geprüfte Berechtigungen.
          </p>
        </div>
        <span className="badge">
          <ShieldCheck size={14} />
          Geschützter Bereich
        </span>
      </div>
      <section className="panel padded">
        <div className="panel-title">
          <Plus size={22} />
          <h2>Neues Benutzerkonto</h2>
        </div>
        <CreateUserForm />
      </section>
      <section className="panel users-panel">
        <div className="panel-heading">
          <div>
            <h2>Benutzerkonten</h2>
            <p>{users.length} Konten angezeigt · maximal 200</p>
          </div>
          <Users size={20} />
        </div>
        <div>
          {users.map((user) => (
            <details className="user-detail" key={user.id}>
              <summary>
                <span className="avatar">
                  {user.name.slice(0, 2).toLocaleUpperCase("de")}
                </span>
                <span>
                  <strong>{user.name}</strong>
                  <small>{user.email}</small>
                </span>
                <span className={"badge " + (user.active ? "green" : "")}>
                  {user.active ? "Aktiv" : "Deaktiviert"}
                </span>
                <span className="user-role-summary">
                  {user.roles.map((r) => roleLabels[r.roleId]).join(", ")}
                </span>
              </summary>
              <div className="user-detail-body">
                {user.mustChangePassword && (
                  <p className="form-note">
                    Startpasswort muss noch geändert werden.
                  </p>
                )}
                <RolesForm
                  user={{
                    id: user.id,
                    active: user.active,
                    roles: user.roles.map((r) => r.roleId),
                  }}
                />
              </div>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}
