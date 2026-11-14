import { redirect } from "next/navigation";
import { requireReadyUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { dutyAccess } from "@/lib/duties";
import { DutyForm } from "@/components/duty-form";

export const metadata = { title: "Mitglieder & Mannschaften" };

type Option = { id: string; name: string };
type Member = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  active: boolean;
  userId: string | null;
  qualifications: string[];
  teams: { teamId: string }[];
};

function MemberForm({
  member,
  teams,
  accounts,
}: {
  member?: Member;
  teams: Option[];
  accounts: Option[];
}) {
  return (
    <DutyForm
      operation="member"
      label={member ? "Mitglied speichern" : "Mitglied anlegen"}
    >
      <input type="hidden" name="id" value={member?.id ?? ""} />
      <div className="form-grid">
        <label>
          Vorname
          <input
            name="firstName"
            defaultValue={member?.firstName}
            required
            maxLength={120}
          />
        </label>
        <label>
          Nachname
          <input
            name="lastName"
            defaultValue={member?.lastName}
            required
            maxLength={120}
          />
        </label>
        <label>
          E-Mail
          <input
            name="email"
            type="email"
            defaultValue={member?.email ?? ""}
            maxLength={254}
          />
        </label>
        <label>
          Telefon
          <input
            name="phone"
            type="tel"
            defaultValue={member?.phone ?? ""}
            maxLength={50}
          />
        </label>
        <label>
          Qualifikationen
          <input
            name="qualifications"
            placeholder="z. B. Kasse, Grill"
            defaultValue={member?.qualifications.join(", ")}
            maxLength={500}
          />
        </label>
        <label>
          Benutzerkonto
          <select name="userId" defaultValue={member?.userId ?? ""}>
            <option value="">Ohne Benutzerkonto</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="check-label">
        <input
          type="checkbox"
          name="active"
          defaultChecked={member?.active ?? true}
        />{" "}
        Aktiv
      </label>
      {teams.length > 0 && (
        <fieldset>
          <legend>Mannschaften</legend>
          <div className="role-grid">
            {teams.map((team) => (
              <label className="check-label" key={team.id}>
                <input
                  type="checkbox"
                  name="teamIds"
                  value={team.id}
                  defaultChecked={member?.teams.some(
                    ({ teamId }) => teamId === team.id,
                  )}
                />
                {team.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}
    </DutyForm>
  );
}

function TeamForm({
  team,
  members,
}: {
  team?: Option & { ageGroup: string | null; managerId: string | null };
  members: Option[];
}) {
  return (
    <DutyForm
      operation="team"
      label={team ? "Mannschaft speichern" : "Mannschaft anlegen"}
    >
      <input type="hidden" name="id" value={team?.id ?? ""} />
      <div className="form-grid">
        <label>
          Name
          <input
            name="name"
            required
            maxLength={120}
            defaultValue={team?.name}
          />
        </label>
        <label>
          Altersgruppe
          <input
            name="ageGroup"
            maxLength={80}
            defaultValue={team?.ageGroup ?? ""}
          />
        </label>
      </div>
      <label>
        Verantwortliche Person
        <select name="managerId" defaultValue={team?.managerId ?? ""}>
          <option value="">Ohne Zuordnung</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
            </option>
          ))}
        </select>
      </label>
      <p className="form-note">
        Für die Mannschaftsverwaltung braucht die Person ein verknüpftes Konto
        mit der entsprechenden Benutzerrolle.
      </p>
    </DutyForm>
  );
}

export default async function MembersPage() {
  const actor = await requireReadyUser();
  const access = await dutyAccess(db, actor);
  if (!access.club && !access.managed.length) redirect("/dienste");
  const [teams, members, accounts] = await Promise.all([
    db.team.findMany({
      where: access.club ? {} : { id: { in: access.managed } },
      include: { manager: { select: { firstName: true, lastName: true } } },
      orderBy: { name: "asc" },
    }),
    db.member.findMany({
      where: access.club
        ? {}
        : { teams: { some: { teamId: { in: access.managed } } } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        active: true,
        email: access.club,
        phone: access.club,
        userId: access.club,
        qualifications: true,
        teams: {
          where: access.club ? {} : { teamId: { in: access.managed } },
          select: { teamId: true },
        },
      },
    }),
    access.club
      ? db.user.findMany({
          select: {
            id: true,
            name: true,
            email: true,
            member: { select: { id: true } },
          },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
  ]);
  const availableAccounts = (memberId?: string) =>
    accounts
      .filter((account) => !account.member || account.member.id === memberId)
      .map((account) => ({
        id: account.id,
        name: `${account.name} · ${account.email}`,
      }));
  const memberOptions = members.map((member) => ({
    id: member.id,
    name: `${member.firstName} ${member.lastName}`,
  }));
  const nameByTeam = new Map(teams.map(({ id, name }) => [id, name]));
  return (
    <div className="stack duty-module">
      <header className="page-intro">
        <div>
          <h1>Mitglieder & Mannschaften</h1>
        </div>
      </header>
      <section className="panel padded stack">
        <h2>Mannschaften</h2>
        {access.club && (
          <details>
            <summary>Mannschaft anlegen</summary>
            <TeamForm members={memberOptions} />
          </details>
        )}
        {teams.length === 0 && (
          <p className="muted">Es sind noch keine Mannschaften vorhanden.</p>
        )}
        {teams.map((team) => (
          <div key={team.id}>
            <h3>{team.name}</h3>
            <p className="muted">
              {[
                team.ageGroup,
                team.manager &&
                  `Verantwortlich: ${team.manager.firstName} ${team.manager.lastName}`,
                `${members.filter((member) => member.teams.some(({ teamId }) => teamId === team.id)).length} Mitglieder`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {access.club && (
              <details>
                <summary>Mannschaft bearbeiten</summary>
                <TeamForm team={team} members={memberOptions} />
              </details>
            )}
          </div>
        ))}
      </section>
      <section className="panel padded stack">
        <h2>Mitglieder</h2>
        {access.club && (
          <details>
            <summary>Mitglied anlegen</summary>
            <MemberForm teams={teams} accounts={availableAccounts()} />
          </details>
        )}
        {members.length === 0 && (
          <p className="muted">Es sind noch keine Mitglieder vorhanden.</p>
        )}
        {members.map((member) => (
          <article key={member.id}>
            <h3>
              {member.firstName} {member.lastName}{" "}
              {!member.active && <span className="badge">Inaktiv</span>}
            </h3>
            <p className="muted">
              {member.teams
                .map(({ teamId }) => nameByTeam.get(teamId))
                .join(", ") || "Ohne Mannschaft"}
            </p>
            {member.qualifications.length > 0 && (
              <p>{member.qualifications.join(", ")}</p>
            )}
            {access.club && (
              <details>
                <summary>Mitglied bearbeiten</summary>
                <MemberForm
                  member={member}
                  teams={teams}
                  accounts={availableAccounts(member.id)}
                />
              </details>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}
