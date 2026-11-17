"use client";

import {
  createContext,
  useContext,
  useId,
  useState,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui/button";
import { updateHallManagers, updateHallStaffing } from "./actions";
import {
  Notice,
  PersonCheck,
  TeamOptions,
  useHall,
  send,
  responsibility,
  type Choice,
} from "./editor";

const FestEditing = createContext(false);

export function FestEditMode({
  allowed,
  children,
}: {
  allowed: boolean;
  children: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <FestEditing.Provider value={allowed && editing}>
      {allowed && (
        <Button
          className="hall-editor"
          type="button"
          variant="outline"
          aria-pressed={editing}
          onClick={() => setEditing(!editing)}
        >
          {editing ? "Bearbeitung schließen" : "Bearbeiten"}
        </Button>
      )}
      {children}
    </FestEditing.Provider>
  );
}

export function FestEditingOnly({ children }: { children: ReactNode }) {
  return useContext(FestEditing) ? (
    <div className="stack hall-editor">{children}</div>
  ) : null;
}

export function FestTaskNames({
  id,
  revision,
  initial,
}: {
  id: string;
  revision: number;
  initial: Record<keyof typeof responsibility, string[]>;
}) {
  const [names, setNames] = useState({
    PURCHASE: initial.PURCHASE.join("\n"),
    OPEN: initial.OPEN.join("\n"),
    CLOSE: initial.CLOSE.join("\n"),
  });
  const { run, pending, message } = useHall();
  return (
    <form
      className="hall-staffing-form"
      onSubmit={(event) => {
        event.preventDefault();
        const split = (value: string) =>
          value
            .split(/\r?\n/)
            .map((name) => name.trim())
            .filter(Boolean);
        run(async () => {
          await send("tasks", {
            id,
            revision,
            names: {
              PURCHASE: split(names.PURCHASE),
              OPEN: split(names.OPEN),
              CLOSE: split(names.CLOSE),
            },
          });
          return "Verantwortliche gespeichert.";
        });
      }}
    >
      <fieldset disabled={pending}>
        <legend>Verantwortliche eintragen</legend>
        {(Object.keys(responsibility) as (keyof typeof responsibility)[]).map(
          (kind) => (
            <label key={kind}>
              {responsibility[kind]}
              <textarea
                rows={2}
                maxLength={16100}
                value={names[kind]}
                placeholder="Ein Name pro Zeile"
                onChange={(event) =>
                  setNames({ ...names, [kind]: event.target.value })
                }
              />
            </label>
          ),
        )}
        <Button disabled={pending}>Verantwortliche speichern</Button>
      </fieldset>
      <Notice message={message} />
    </form>
  );
}

export function StaffingRow({
  shift,
  time,
  teams,
  canChangeTeam,
  canEditPeople,
  notices,
}: {
  shift: {
    id: string;
    staffingRevision: number;
    teamId: string | null;
    start: string;
    end: string;
    team: { name: string } | null;
    requiredHelpers: number;
    helperNames: string[];
    members: Choice[];
  };
  time: string;
  teams: Choice[];
  canChangeTeam: boolean;
  canEditPeople: boolean;
  notices: string[];
}) {
  const editing = useContext(FestEditing);
  const shiftForm = useId();
  const [teamId, setTeamId] = useState(shift.teamId ?? "");
  const [start, setStart] = useState(shift.start);
  const [end, setEnd] = useState(shift.end);
  const [names, setNames] = useState(shift.helperNames);
  const [removed, setRemoved] = useState<string[]>([]);
  const { run, pending, message } = useHall();
  const linked = shift.members.filter(({ id }) => !removed.includes(id));
  const freeFields = Math.max(0, shift.requiredHelpers - linked.length);
  const listed = [
    ...shift.members.map(({ name }) => name),
    ...shift.helperNames.filter(Boolean),
  ];
  const open = Math.max(0, shift.requiredHelpers - listed.length);
  const identity = { id: shift.id, revision: shift.staffingRevision };

  return (
    <tr>
      <td data-label="Schicht">
        {time}
        {editing && canChangeTeam && (
          <form
            id={shiftForm}
            className="hall-editor hall-staffing-form"
            onSubmit={(event) => {
              event.preventDefault();
              run(async () => {
                const response = await updateHallStaffing({
                  kind: "team",
                  ...identity,
                  teamId: teamId || null,
                  times: { start, end },
                });
                if (!response.ok) throw new Error(response.error);
                return "Schicht gespeichert.";
              });
            }}
          >
            <label>
              Beginn
              <input
                type="datetime-local"
                required
                disabled={pending}
                value={start}
                onChange={(event) => setStart(event.target.value)}
              />
            </label>
            <label>
              Ende
              <input
                type="datetime-local"
                required
                disabled={pending}
                value={end}
                onChange={(event) => setEnd(event.target.value)}
              />
            </label>
          </form>
        )}
      </td>
      <td data-label="Mannschaft">
        {editing && canChangeTeam ? (
          <>
            <span className="hall-print-only">
              {shift.team?.name ?? "Keine Mannschaft"}
            </span>
            <div className="hall-editor hall-staffing-form">
              <select
                form={shiftForm}
                aria-label={`Mannschaft für ${time}`}
                value={teamId}
                disabled={pending}
                onChange={(event) => setTeamId(event.target.value)}
              >
                <option value="">Keine Mannschaft</option>
                <TeamOptions options={teams} />
              </select>
              {(teamId !== (shift.teamId ?? "") ||
                start !== shift.start ||
                end !== shift.end) && (
                <Button form={shiftForm} disabled={pending}>
                  Schicht speichern
                </Button>
              )}
            </div>
          </>
        ) : (
          (shift.team?.name ?? "Keine Mannschaft")
        )}
      </td>
      <td data-label="Personen">
        {listed.length > 0 && (
          <div className="hall-staffing-names">{listed.join(", ")}</div>
        )}
        <span>
          {listed.length}/{shift.requiredHelpers}
        </span>
        {editing && canEditPeople && (
          <details className="hall-editor">
            <summary>Personen bearbeiten</summary>
            <form
              className="hall-staffing-form"
              onSubmit={(event) => {
                event.preventDefault();
                run(async () => {
                  const response = await updateHallStaffing({
                    kind: "people",
                    ...identity,
                    names: names.slice(0, freeFields),
                    removedMemberIds: removed,
                  });
                  if (!response.ok) throw new Error(response.error);
                  return "Personen gespeichert.";
                });
              }}
            >
              <fieldset disabled={pending}>
                {shift.members.map(({ id, name }, index) => (
                  <label className="hall-staffing-linked" key={id}>
                    <input
                      type="checkbox"
                      checked={removed.includes(id)}
                      onChange={(event) =>
                        setRemoved(
                          event.target.checked
                            ? [...removed, id]
                            : removed.filter((value) => value !== id),
                        )
                      }
                    />
                    {name} entfernen (Mitglied, Person {index + 1})
                  </label>
                ))}
                {Array.from({ length: freeFields }, (_, index) => (
                  <label key={index}>
                    Person {linked.length + index + 1}
                    <input
                      type="text"
                      autoComplete="off"
                      maxLength={160}
                      placeholder="Offener Platz"
                      value={names[index] ?? ""}
                      onChange={(event) => {
                        const value = event.target.value;
                        setNames((current) =>
                          Array.from(
                            { length: Math.max(current.length, index + 1) },
                            (_, i) =>
                              i === index ? value : (current[i] ?? ""),
                          ),
                        );
                      }}
                    />
                  </label>
                ))}
                <p className="form-note" aria-live="polite">
                  {linked.length +
                    names.slice(0, freeFields).filter((name) => name.trim())
                      .length}
                  /{shift.requiredHelpers} Personen eingetragen
                </p>
                <Button disabled={pending}>Personen speichern</Button>
              </fieldset>
            </form>
          </details>
        )}
        {editing && (
          <div className="hall-editor">
            <Notice message={message} />
          </div>
        )}
      </td>
      <td data-label="Status">
        {[
          open
            ? `${open} ${open === 1 ? "Platz offen" : "Plätze offen"}`
            : "Besetzt",
          ...notices,
        ]
          .filter(Boolean)
          .join(" · ")}
      </td>
    </tr>
  );
}

export function HallTeamManagers({
  teams,
  members,
}: {
  teams: (Choice & { hallManagers: { memberId: string }[] })[];
  members: (Choice & { active: boolean })[];
}) {
  const [teamId, setTeamId] = useState(teams[0]?.id ?? "");
  const team = teams.find(({ id }) => id === teamId);
  return (
    <details className="panel padded">
      <summary>Mannschaftsverantwortliche für Hallenbewirtung</summary>
      {team ? (
        <div className="stack">
          <label>
            Mannschaft
            <select
              value={teamId}
              onChange={(event) => setTeamId(event.target.value)}
            >
              <TeamOptions options={teams} />
            </select>
          </label>
          <ManagerSelection
            key={`${team.id}:${team.hallManagers
              .map(({ memberId }) => memberId)
              .sort()
              .join(",")}`}
            teamId={team.id}
            assigned={team.hallManagers.map(({ memberId }) => memberId)}
            members={members}
          />
        </div>
      ) : (
        <p>Lege zuerst eine Mannschaft in der Mannschaftsverwaltung an.</p>
      )}
    </details>
  );
}

function ManagerSelection({
  teamId,
  assigned,
  members,
}: {
  teamId: string;
  assigned: string[];
  members: (Choice & { active: boolean })[];
}) {
  const [memberIds, setMemberIds] = useState(assigned);
  const { run, pending, message } = useHall();
  const choices = members.filter(
    ({ id, active }) => active || assigned.includes(id),
  );
  return (
    <form
      className="stack"
      onSubmit={(event) => {
        event.preventDefault();
        run(async () => {
          const response = await updateHallManagers({
            id: teamId,
            memberIds,
            previousMemberIds: assigned,
          });
          if (!response.ok) throw new Error(response.error);
          return "Verantwortliche gespeichert.";
        });
      }}
    >
      <fieldset disabled={pending}>
        <PersonCheck
          choices={choices}
          value={memberIds}
          onChange={setMemberIds}
        >
          Mitglieder auswählen
        </PersonCheck>
        <p className="form-note">
          Verantwortliche brauchen für die Bearbeitung ein mit ihrem Mitglied
          verknüpftes Benutzerkonto.
        </p>
        <Button disabled={pending}>Verantwortliche speichern</Button>
      </fieldset>
      <Notice message={message} />
    </form>
  );
}
