import type { Prisma } from "@prisma/client";
import { requireReadyUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { dutyAccess, dutyScope, managesShift } from "@/lib/duties";
import { DutyForm } from "@/components/duty-form";

export const metadata = { title: "Dienste" };
const displayTime = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  dateStyle: "medium",
  timeStyle: "short",
});
const inputTime = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Berlin",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const timeValue = (date: Date) => inputTime.format(date).replace(" ", "T");
const statusLabel = {
  PLANNED: "Geplant",
  COMPLETED: "Abgeschlossen",
  CANCELLED: "Abgesagt",
};
const shiftInclude = {
  type: { select: { name: true } },
  team: { select: { name: true } },
  event: { select: { title: true } },
  assignments: {
    select: {
      id: true,
      memberId: true,
      actualMinutes: true,
      member: { select: { firstName: true, lastName: true } },
      swaps: {
        where: { status: { in: ["REQUESTED", "TARGET_APPROVED"] } },
        select: {
          id: true,
          status: true,
          targetMemberId: true,
          targetMember: { select: { firstName: true, lastName: true } },
        },
      },
    },
  },
} satisfies Prisma.DutyShiftInclude;
type Shift = Prisma.DutyShiftGetPayload<{ include: typeof shiftInclude }>;
type Option = { id: string; name: string };

function Interval({ shift }: { shift?: Shift }) {
  return (
    <div className="form-grid">
      <label>
        Beginn (deutsche Ortszeit)
        <input
          type="datetime-local"
          name="startsAt"
          required
          defaultValue={shift && timeValue(shift.startsAt)}
        />
      </label>
      <label>
        Ende (deutsche Ortszeit)
        <input
          type="datetime-local"
          name="endsAt"
          required
          defaultValue={shift && timeValue(shift.endsAt)}
        />
      </label>
    </div>
  );
}

function Select({
  name,
  label,
  options,
  value = "",
  empty,
}: {
  name: string;
  label: string;
  options: Option[];
  value?: string;
  empty?: string;
}) {
  return (
    <label>
      {label}
      <select name={name} defaultValue={value} required={empty === undefined}>
        <option value="" disabled={empty === undefined}>
          {empty ?? "Bitte auswählen"}
        </option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function ShiftForm({
  shift,
  types,
  teams,
  events,
  club,
}: {
  shift?: Shift;
  types: Option[];
  teams: Option[];
  events: Option[];
  club: boolean;
}) {
  return (
    <DutyForm
      operation="shift"
      label={shift ? "Dienst speichern" : "Dienst anlegen"}
    >
      <input type="hidden" name="id" value={shift?.id ?? ""} />
      <div className="form-grid">
        <Select
          name="typeId"
          label="Dienstart"
          options={types}
          value={shift?.typeId}
        />
        <Select
          name="teamId"
          label="Mannschaft"
          options={teams}
          value={shift?.teamId ?? ""}
          empty={club ? "Vereinsweit" : undefined}
        />
        <Select
          name="eventId"
          label="Veranstaltung"
          options={events}
          value={shift?.eventId ?? ""}
          empty="Ohne Veranstaltung"
        />
        <label>
          Ort
          <input
            name="location"
            required
            maxLength={120}
            defaultValue={shift?.location}
          />
        </label>
      </div>
      <Interval shift={shift} />
      <div className="form-grid">
        <label>
          Benötigte Helfer
          <input
            name="requiredHelpers"
            type="number"
            min={1}
            max={100}
            required
            defaultValue={shift?.requiredHelpers ?? 1}
          />
        </label>
        {shift ? (
          <input type="hidden" name="occurrences" value="1" />
        ) : (
          <label>
            Anzahl wöchentlicher Termine
            <input
              name="occurrences"
              type="number"
              min={1}
              max={26}
              required
              defaultValue={1}
            />
          </label>
        )}
      </div>
      <label className="check-label">
        <input
          type="checkbox"
          name="voluntary"
          defaultChecked={shift?.voluntary ?? true}
        />{" "}
        Freiwillige Anmeldung erlauben
      </label>
    </DutyForm>
  );
}

function HiddenId({ name, id }: { name: string; id: string }) {
  return <input type="hidden" name={name} value={id} />;
}

function SwapDecision({ id, accept }: { id: string; accept?: boolean }) {
  return (
    <DutyForm
      operation="swapDecision"
      label={accept ? "Tausch bestätigen" : "Anfrage beenden"}
    >
      <HiddenId name="swapId" id={id} />
      <HiddenId name="decision" id={accept ? "accept" : "decline"} />
    </DutyForm>
  );
}

function ShiftCard({
  shift,
  access,
  people,
  types,
  teams,
  events,
  now,
}: {
  shift: Shift;
  access: Awaited<ReturnType<typeof dutyAccess>>;
  people: (Option & { linked: boolean; active: boolean; teamIds: string[] })[];
  types: Option[];
  teams: Option[];
  events: Option[];
  now: Date;
}) {
  const manager = managesShift(access, shift.teamId);
  const upcoming = shift.status === "PLANNED" && shift.startsAt > now;
  const ended = shift.endsAt <= now;
  const mine = shift.assignments.find(
    ({ memberId }) => memberId === access.memberId,
  );
  const open = Math.max(0, shift.requiredHelpers - shift.assignments.length);
  const choices = people.filter(
    (person) =>
      person.active &&
      (!shift.teamId || person.teamIds.includes(shift.teamId)) &&
      !shift.assignments.some(({ memberId }) => memberId === person.id),
  );
  return (
    <article className="panel padded stack" id={shift.id}>
      <div>
        <h3>
          {shift.type.name}{" "}
          <span className="badge">{statusLabel[shift.status]}</span>
        </h3>
        <p>
          {displayTime.format(shift.startsAt)} bis{" "}
          {displayTime.format(shift.endsAt)} · {shift.location}
        </p>
        <p className="muted">
          {[
            shift.team?.name ?? "Vereinsweit",
            shift.event?.title,
            shift.status === "PLANNED" &&
              `${open} von ${shift.requiredHelpers} Plätzen frei`,
            mine && "Mein Dienst",
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {mine && upcoming && +shift.startsAt - +now < 48 * 60 * 60 * 1000 && (
          <p role="status">
            Erinnerung: Dein Dienst beginnt innerhalb der nächsten 48 Stunden.
          </p>
        )}
        {mine?.actualMinutes != null && (
          <p>Erfasste Zeit: {mine.actualMinutes} Minuten</p>
        )}
      </div>
      {upcoming &&
        !mine &&
        open > 0 &&
        shift.voluntary &&
        access.memberId &&
        (!shift.teamId || access.teams.includes(shift.teamId)) && (
          <DutyForm operation="assign" label="Für diesen Dienst anmelden">
            <HiddenId name="shiftId" id={shift.id} />
            <HiddenId name="memberId" id="" />
          </DutyForm>
        )}
      {upcoming && manager && open > 0 && choices.length > 0 && (
        <details>
          <summary>Helfer einteilen</summary>
          <DutyForm operation="assign" label="Zuteilen">
            <HiddenId name="shiftId" id={shift.id} />
            <Select name="memberId" label="Mitglied" options={choices} />
          </DutyForm>
        </details>
      )}
      {upcoming &&
        mine &&
        !mine.swaps.length &&
        choices.some(({ linked }) => linked) && (
          <details>
            <summary>Diensttausch anfragen</summary>
            <DutyForm operation="swap" label="Tauschanfrage senden">
              <HiddenId name="assignmentId" id={mine.id} />
              <Select
                name="memberId"
                label="Wer soll den Dienst übernehmen?"
                options={choices.filter(({ linked }) => linked)}
              />
            </DutyForm>
          </details>
        )}
      {shift.assignments.map((assignment) => {
        const own = assignment.memberId === access.memberId;
        const swaps = assignment.swaps.filter(
          (swap) => manager || own || swap.targetMemberId === access.memberId,
        );
        if (!manager && !own && !swaps.length) return null;
        return (
          <div key={assignment.id} className="stack">
            {manager && (
              <strong>
                {assignment.member.firstName} {assignment.member.lastName}
              </strong>
            )}
            {manager && ended && shift.status !== "CANCELLED" && (
              <details>
                <summary>Geleistete Zeit erfassen</summary>
                <DutyForm operation="minutes" label="Minuten speichern">
                  <HiddenId name="assignmentId" id={assignment.id} />
                  <label>
                    Minuten (0 = nicht erschienen)
                    <input
                      type="number"
                      name="minutes"
                      min={0}
                      max={1440}
                      required
                      defaultValue={
                        assignment.actualMinutes ??
                        Math.min(
                          1440,
                          Math.round((+shift.endsAt - +shift.startsAt) / 60000),
                        )
                      }
                    />
                  </label>
                </DutyForm>
              </details>
            )}
            {swaps.map((swap) => (
              <div key={swap.id} className="stack">
                <p>
                  Tauschanfrage von {assignment.member.firstName}{" "}
                  {assignment.member.lastName} an {swap.targetMember.firstName}{" "}
                  {swap.targetMember.lastName}
                  {swap.status === "TARGET_APPROVED"
                    ? " · Wartet auf Freigabe der Dienstplanung"
                    : " · Wartet auf Zustimmung"}
                </p>
                {upcoming &&
                  ((swap.status === "REQUESTED" &&
                    swap.targetMemberId === access.memberId) ||
                    (swap.status === "TARGET_APPROVED" && manager)) && (
                    <SwapDecision id={swap.id} accept />
                  )}
                <SwapDecision id={swap.id} />
              </div>
            ))}
          </div>
        );
      })}
      {manager && shift.status === "PLANNED" && (
        <details>
          <summary>Dienst verwalten</summary>
          {upcoming && (
            <ShiftForm
              shift={shift}
              types={types}
              teams={teams}
              events={events}
              club={access.club}
            />
          )}
          <DutyForm
            operation="shiftStatus"
            label={ended ? "Dienst abschließen" : "Dienst absagen"}
          >
            <HiddenId name="shiftId" id={shift.id} />
            <HiddenId name="status" id={ended ? "COMPLETED" : "CANCELLED"} />
          </DutyForm>
        </details>
      )}
    </article>
  );
}

export default async function DutiesPage({
  searchParams,
}: {
  searchParams: Promise<{ ansicht?: string }>;
}) {
  const actor = await requireReadyUser();
  const access = await dutyAccess(db, actor);
  const manager = access.club || access.managed.length > 0;
  const now = new Date();
  const selectedView = (await searchParams).ansicht;
  const view =
    selectedView === "meine" || selectedView === "vergangen"
      ? selectedView
      : undefined;
  const incoming: Prisma.DutyShiftWhereInput[] = access.memberId
    ? [
        {
          assignments: {
            some: {
              swaps: {
                some: {
                  targetMemberId: access.memberId,
                  status: { in: ["REQUESTED", "TARGET_APPROVED"] },
                },
              },
            },
          },
        },
      ]
    : [];
  const where: Prisma.DutyShiftWhereInput = {
    AND: [
      ...(access.club ? [] : [{ OR: [dutyScope(access), ...incoming] }]),
      view === "vergangen"
        ? { OR: [{ endsAt: { lt: now } }, { status: { not: "PLANNED" } }] }
        : { status: "PLANNED", endsAt: { gte: now } },
      ...(view === "meine"
        ? [{ assignments: { some: { memberId: access.memberId ?? "" } } }]
        : []),
    ],
  };
  const [shifts, types, teams, events, candidates, availability, total] =
    await Promise.all([
      db.dutyShift.findMany({
        where,
        include: shiftInclude,
        orderBy: [
          { startsAt: view === "vergangen" ? "desc" : "asc" },
          { id: "asc" },
        ],
      }),
      manager ? db.dutyType.findMany({ orderBy: { name: "asc" } }) : [],
      manager
        ? db.team.findMany({
            where: access.club ? {} : { id: { in: access.managed } },
            orderBy: { name: "asc" },
          })
        : [],
      manager
        ? db.event.findMany({
            select: { id: true, title: true },
            orderBy: { startsAt: "desc" },
          })
        : [],
      manager || access.memberId
        ? db.member.findMany({
            where: {
              active: true,
              ...(access.club
                ? {}
                : {
                    OR: [
                      {
                        teams: {
                          some: {
                            teamId: {
                              in: [...access.teams, ...access.managed],
                            },
                          },
                        },
                      },
                      ...(access.memberId ? [{ userId: { not: null } }] : []),
                    ],
                  }),
            },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              active: true,
              user: { select: { active: true } },
              teams: { select: { teamId: true } },
            },
            orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
          })
        : [],
      access.memberId
        ? db.availability.findMany({
            where: { memberId: access.memberId, endsAt: { gt: now } },
            orderBy: { startsAt: "asc" },
          })
        : [],
      access.memberId
        ? db.dutyAssignment.aggregate({
            where: {
              memberId: access.memberId,
              shift: { status: "COMPLETED" },
            },
            _sum: { actualMinutes: true },
          })
        : null,
    ]);
  const people = candidates.map((person) => ({
    id: person.id,
    name: `${person.firstName} ${person.lastName}`,
    active: person.active,
    linked: person.user?.active ?? false,
    teamIds: person.teams.map(({ teamId }) => teamId),
  }));
  const eventOptions = events.map(({ id, title }) => ({ id, name: title }));
  return (
    <div className="stack duty-module">
      <header className="page-intro">
        <div>
          <h1>Dienste</h1>
        </div>
      </header>
      <nav aria-label="Dienstansicht" className="role-badges">
        {[
          [undefined, "Kommende Dienste"],
          ["meine", "Meine kommenden Dienste"],
          ["vergangen", "Verlauf"],
        ].map(([key, label]) => (
          <a
            className="badge"
            key={label}
            href={key ? `/dienste?ansicht=${key}` : "/dienste"}
            aria-current={view === key ? "page" : undefined}
          >
            {label}
          </a>
        ))}
      </nav>
      {access.memberId ? (
        <section className="panel padded stack">
          <h2>Meine Verfügbarkeit</h2>
          <p>
            Geleistete Zeit:{" "}
            {new Intl.NumberFormat("de-DE", {
              maximumFractionDigits: 2,
            }).format((total?._sum.actualMinutes ?? 0) / 60)}{" "}
            Stunden
          </p>
          {availability.map((entry) => (
            <p key={entry.id}>
              {displayTime.format(entry.startsAt)} bis{" "}
              {displayTime.format(entry.endsAt)} ·{" "}
              {entry.available ? "Verfügbar" : "Nicht verfügbar"}
            </p>
          ))}
          <details>
            <summary>Verfügbarkeit eintragen</summary>
            <DutyForm operation="availability" label="Verfügbarkeit speichern">
              <Interval />
              <label className="check-label">
                <input type="checkbox" name="available" defaultChecked />{" "}
                Verfügbar
              </label>
            </DutyForm>
          </details>
        </section>
      ) : (
        <p className="muted">
          Für die Selbstanmeldung muss die Vereinsverwaltung dein Konto mit
          einem aktiven Mitglied verknüpfen.
        </p>
      )}
      {manager && (
        <section className="panel padded stack">
          <h2>Dienstplanung</h2>
          {access.club && (
            <details>
              <summary>Dienstart anlegen</summary>
              <DutyForm operation="type" label="Dienstart speichern">
                <label>
                  Name
                  <input
                    name="name"
                    required
                    maxLength={120}
                    placeholder="z. B. Hallentheke"
                  />
                </label>
              </DutyForm>
            </details>
          )}
          {types.length ? (
            <details>
              <summary>Dienst anlegen</summary>
              <ShiftForm
                types={types}
                teams={teams}
                events={eventOptions}
                club={access.club}
              />
            </details>
          ) : (
            <p className="muted">
              Für die Dienstplanung muss zuerst eine Dienstart vorhanden sein.
            </p>
          )}
        </section>
      )}
      {shifts.length === 0 && (
        <p className="muted">Für diese Ansicht sind keine Dienste vorhanden.</p>
      )}
      {shifts.map((shift) => (
        <ShiftCard
          key={shift.id}
          shift={shift}
          access={access}
          people={people}
          types={types}
          teams={teams}
          events={eventOptions}
          now={now}
        />
      ))}
    </div>
  );
}
