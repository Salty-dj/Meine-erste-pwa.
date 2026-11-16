import Link from "next/link";
import { db } from "@/lib/db";
import { requireReadyUser } from "@/lib/auth";
import { can } from "@/lib/roles";
import {
  dayOf,
  hallDay,
  overlap,
  wallMinutes,
  wallValue,
} from "@/lib/hall/planner";
import { memberPlanScope } from "@/lib/hall/service";
import {
  CreatePlan,
  PlanEditor,
  PrintPlan,
  Publish,
  RoleManagement,
  type PlanEdit,
} from "./editor";
import { ImportSchedule, SeasonPlanner } from "./season";

export const metadata = { title: "Hallenbewirtung" };
const date = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "full",
  timeZone: "Europe/Berlin",
});
const dateTime = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Europe/Berlin",
});
const clock = new Intl.DateTimeFormat("de-DE", {
  timeStyle: "short",
  timeZone: "Europe/Berlin",
});
const amount = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 });
const memberSelect = { id: true, firstName: true, lastName: true } as const;
const tasks = { PURCHASE: "Einkauf", OPEN: "Aufmachen", CLOSE: "Zumachen" };
const fullName = (member: { firstName: string; lastName: string }) =>
  `${member.firstName} ${member.lastName}`;
const shiftDay = (day: string, delta: number) =>
  new Date(+new Date(day) + delta * 86400000).toISOString().slice(0, 10);
const timeSpan = (startsAt: Date, endsAt: Date) =>
  `${clock.format(startsAt)}–${dayOf(startsAt) === dayOf(endsAt) ? clock.format(endsAt) : dateTime.format(endsAt)} Uhr`;

export default async function HallPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string; season?: string }>;
}) {
  const actor = await requireReadyUser();
  const manager = can(actor.roles, "hall");
  const admin = can(actor.roles, "club");
  const params = await searchParams;
  const today = dayOf(new Date());
  const parsed = hallDay.safeParse(params.date);
  const selected = parsed.success ? parsed.data : today;
  const view =
    params.view === "day" || params.view === "week" ? params.view : "season";
  const defaultYear =
    Number(today.slice(0, 4)) - Number(today.slice(5, 7) < "07");
  const season = /^20[0-9]{2}$/.test(params.season ?? "")
    ? Number(params.season)
    : defaultYear;
  const from = `${season}-07-01`,
    to = `${season + 1}-06-30`;
  const weekday = new Date(selected + "T12:00:00Z").getUTCDay();
  const monday = shiftDay(selected, -(weekday + 6) % 7);
  const bounds =
    view === "day"
      ? { gte: selected, lte: selected }
      : view === "week"
        ? { gte: monday, lte: shiftDay(monday, 6) }
        : { gte: from, lte: to };
  const own = manager
    ? null
    : await db.member.findUnique({
        where: { userId: actor.id },
        select: { id: true, active: true, teams: { select: { teamId: true } } },
      });
  const ownId = own?.active ? own.id : "";
  const ownTeams = own?.active ? own.teams.map(({ teamId }) => teamId) : [];
  const scope = manager ? {} : memberPlanScope(ownId, ownTeams);
  const [plans, teams, members, accounts, allSeason, games] = await Promise.all(
    [
      db.hallPlan.findMany({
        where: { day: bounds, ...scope },
        orderBy: [{ startsAt: "asc" }, { venue: "asc" }],
        include: {
          shifts: {
            where: manager
              ? {}
              : {
                  OR: [
                    { teamId: { in: ownTeams } },
                    { members: { some: { id: ownId } } },
                  ],
                },
            orderBy: [{ startsAt: "asc" }, { id: "asc" }],
            include: {
              team: { select: { name: true } },
              members: {
                where: manager ? {} : { id: ownId },
                select: memberSelect,
              },
            },
          },
          tasks: {
            where: manager ? {} : { members: { some: { id: ownId } } },
            include: {
              members: {
                where: manager ? {} : { id: ownId },
                select: memberSelect,
              },
            },
          },
        },
      }),
      manager
        ? db.team.findMany({
            select: { id: true, name: true },
            orderBy: { name: "asc" },
          })
        : [],
      manager
        ? db.member.findMany({
            where: { active: true },
            select: memberSelect,
            orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
          })
        : [],
      admin
        ? db.user.findMany({
            select: {
              id: true,
              name: true,
              email: true,
              roles: {
                where: { roleId: "HALL_CATERING" },
                select: { roleId: true },
              },
            },
            orderBy: { name: "asc" },
          })
        : [],
      manager
        ? db.hallShift.findMany({
            where: { plan: { day: { gte: from, lte: to } } },
            select: {
              teamId: true,
              startsAt: true,
              endsAt: true,
              _count: { select: { members: true } },
            },
          })
        : [],
      db.hallMatch.findMany({
        where: {
          startsAt: {
            gte: new Date(shiftDay(bounds.gte, -1)),
            lt: new Date(shiftDay(bounds.lte, 2)),
          },
        },
        orderBy: { startsAt: "asc" },
      }),
    ],
  );
  const choices = members.map((member) => ({
    id: member.id,
    name: fullName(member),
  }));
  const stat = teams.map((team) => {
    const shifts = allSeason.filter((shift) => shift.teamId === team.id);
    return {
      ...team,
      count: shifts.length,
      hours: shifts.reduce(
        (sum, shift) => sum + (+shift.endsAt - +shift.startsAt) / 3600000,
        0,
      ),
      early: shifts.filter((shift) => wallMinutes(shift.startsAt) < 720).length,
      late: shifts.filter(
        (shift) =>
          dayOf(shift.startsAt) !== dayOf(shift.endsAt) ||
          wallMinutes(shift.endsAt) >= 1200,
      ).length,
      months: [
        ...new Set(shifts.map((shift) => dayOf(shift.startsAt).slice(0, 7))),
      ]
        .sort()
        .map(
          (month) =>
            `${month.slice(5)}/${month.slice(0, 4)}: ${shifts.filter((shift) => dayOf(shift.startsAt).startsWith(month)).length}`,
        ),
    };
  });
  return (
    <div className="stack duty-module hall-module">
      <header className="page-intro">
        <div>
          <h1>Hallenbewirtung</h1>
        </div>
      </header>
      {manager && (
        <div className="stack hall-editor">
          <CreatePlan />
          <ImportSchedule teams={teams} />
          <SeasonPlanner teams={teams} members={choices} from={from} to={to} />
          {admin && (
            <RoleManagement
              accounts={accounts.map((account) => ({
                id: account.id,
                name: `${account.name} · ${account.email}`,
                enabled: account.roles.length > 0,
              }))}
            />
          )}
        </div>
      )}
      <section className="panel padded hall-editor">
        <form method="get" className="stack">
          <div className="form-grid">
            <label>
              Ansicht
              <select name="view" defaultValue={view}>
                <option value="day">Einzelner Spieltag</option>
                <option value="week">Kalenderwoche</option>
                <option value="season">Gesamte Saison</option>
              </select>
            </label>
            <label>
              Datum für Spieltag oder Kalenderwoche
              <input name="date" type="date" defaultValue={selected} />
            </label>
            <label>
              Saison ab Juli
              <input
                name="season"
                type="number"
                min={2000}
                max={2099}
                defaultValue={season}
              />
            </label>
          </div>
          <button className="hall-filter">Ansicht anzeigen</button>
        </form>
      </section>
      <div className="hall-editor">
        <PrintPlan />
      </div>
      <section className="stack">
        <h2>
          {view === "season"
            ? `Saison ${season}/${season + 1}`
            : view === "week"
              ? `Woche vom ${monday.split("-").reverse().join(".")}`
              : date.format(new Date(selected + "T12:00:00Z"))}
        </h2>
        {plans.length === 0 && (
          <p className="muted">
            {manager
              ? "Für diese Ansicht gibt es noch keine Dienstpläne."
              : "Für dich sind in dieser Ansicht keine veröffentlichten Dienste eingeteilt."}
          </p>
        )}
        {plans.map((plan) => {
          const dayGames = games.filter(
            (game) =>
              dayOf(game.startsAt) === plan.day &&
              game.ownHome &&
              game.venue.trim().toLocaleLowerCase("de") ===
                plan.venue.trim().toLocaleLowerCase("de"),
          );
          const mappedTasks = Object.fromEntries(
            (Object.keys(tasks) as (keyof typeof tasks)[]).map((kind) => [
              kind,
              plan.tasks
                .find((task) => task.kind === kind)
                ?.members.map(({ id }) => id) ?? [],
            ]),
          ) as PlanEdit["tasks"];
          return (
            <article
              key={plan.id}
              id={plan.id}
              className="panel padded stack hall-plan"
            >
              <div>
                <h3>
                  {plan.title}{" "}
                  <span className="badge">
                    {plan.publishedAt ? "Veröffentlicht" : "Entwurf"}
                  </span>
                </h3>
                <p>
                  {date.format(new Date(plan.day + "T12:00:00Z"))} ·{" "}
                  {plan.venue} · {timeSpan(plan.startsAt, plan.endsAt)}
                </p>
                {plan.notes && <p className="hall-notes">{plan.notes}</p>}
              </div>
              {dayGames.length > 0 && (
                <div>
                  <h4>Spiele</h4>
                  {dayGames.map((game) => (
                    <p key={game.id}>
                      {timeSpan(game.startsAt, game.endsAt)} · {game.home} –{" "}
                      {game.away}
                      {game.number ? ` · Nr. ${game.number}` : ""}
                    </p>
                  ))}
                </div>
              )}
              {plan.shifts.length > 0 && (
                <div className="hall-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Schicht</th>
                        <th>Mannschaft</th>
                        <th>Personen</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plan.shifts.map((shift) => {
                        const plays =
                          manager &&
                          games.some(
                            (game) =>
                              game.teamId === shift.teamId &&
                              overlap(shift, game),
                          );
                        return (
                          <tr key={shift.id}>
                            <td data-label="Schicht">
                              {timeSpan(shift.startsAt, shift.endsAt)}
                            </td>
                            <td data-label="Mannschaft">
                              {shift.team?.name ?? "–"}
                            </td>
                            <td data-label="Personen">
                              {shift.members.map(fullName).join(", ") || "–"}{" "}
                              {manager &&
                                ` · ${shift.members.length}/${shift.requiredHelpers}`}
                            </td>
                            <td data-label="Status">
                              {[
                                !shift.teamId && shift.members.length === 0
                                  ? "Offen"
                                  : manager &&
                                      shift.members.length <
                                        shift.requiredHelpers
                                    ? "Sollstärke offen"
                                    : "",
                                shift.locked ? "Gesperrt" : "",
                                manager && shift.conflict,
                                plays ? "Konflikt mit eigenem Spiel" : "",
                              ]
                                .filter(Boolean)
                                .join(" · ") || "Eingeteilt"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <dl className="hall-responsibilities">
                {(Object.keys(tasks) as (keyof typeof tasks)[]).map((kind) => {
                  const task = plan.tasks.find((task) => task.kind === kind);
                  return manager || task ? (
                    <div key={kind}>
                      <dt>{tasks[kind]}</dt>
                      <dd>
                        {task?.members.map(fullName).join(", ") || "Offen"}
                      </dd>
                    </div>
                  ) : null;
                })}
              </dl>
              {manager && (
                <>
                  {!plan.publishedAt && (
                    <PlanEditor
                      key={plan.revision}
                      teams={teams}
                      members={choices}
                      plan={{
                        id: plan.id,
                        revision: plan.revision,
                        title: plan.title,
                        venue: plan.venue,
                        notes: plan.notes,
                        start: wallValue(plan.startsAt),
                        end: wallValue(plan.endsAt),
                        tasks: mappedTasks,
                        shifts: plan.shifts.map((shift) => ({
                          id: shift.id,
                          start: wallValue(shift.startsAt),
                          end: wallValue(shift.endsAt),
                          people: shift.requiredHelpers,
                          teamId: shift.teamId,
                          memberIds: shift.members.map(({ id }) => id),
                          locked: shift.locked,
                        })),
                      }}
                    />
                  )}
                  <Publish
                    id={plan.id}
                    revision={plan.revision}
                    published={!!plan.publishedAt}
                  />
                </>
              )}
            </article>
          );
        })}
      </section>
      {manager && (
        <section className="panel padded stack">
          <h2>
            Verteilung {season}/{season + 1}
          </h2>
          <p>
            {
              allSeason.filter(
                (shift) => !shift.teamId && !shift._count.members,
              ).length
            }{" "}
            Schichten ohne Einteilung
          </p>
          <p className="form-note">
            Einschließlich Entwürfen. Frühdienst beginnt vor 12 Uhr, Spätdienst
            endet ab 20 Uhr. Die Stunden beziehen sich auf Schichtdauer je
            Mannschaft.
          </p>
          <div className="hall-table">
            <table>
              <thead>
                <tr>
                  <th>Mannschaft</th>
                  <th>Dienste</th>
                  <th>Stunden</th>
                  <th>Früh</th>
                  <th>Spät</th>
                  <th>Monate</th>
                </tr>
              </thead>
              <tbody>
                {stat.map(({ id, name, count, hours, early, late, months }) => (
                  <tr key={id}>
                    <th>{name}</th>
                    <td data-label="Dienste">{count}</td>
                    <td data-label="Stunden">{amount.format(hours)}</td>
                    <td data-label="Früh">{early}</td>
                    <td data-label="Spät">{late}</td>
                    <td data-label="Monate">{months.join(" · ") || "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <Link className="hall-editor" href="/dienste">
        Zu den übrigen Diensten
      </Link>
    </div>
  );
}
