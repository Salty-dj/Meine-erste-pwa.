"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { updateFest, updateHallManagers } from "./actions";
import {
  Notice,
  PersonCheck,
  TeamOptions,
  useHall,
  responsibility,
  type Choice,
} from "./editor";

const FestEditing = createContext(false);

type TaskKind = keyof typeof responsibility;
const taskKinds = Object.keys(responsibility) as TaskKind[];
const fieldName = (id: string, field: string) => `${id}:${field}`;

export function FestEditMode({
  allowed,
  id,
  revision,
  day,
  shiftIds,
  extra,
  children,
}: {
  allowed: boolean;
  id: string;
  revision: number;
  day?: string;
  shiftIds: string[];
  extra?: ReactNode;
  children: ReactNode;
}) {
  const [editingRevision, setEditingRevision] = useState<number | null>(null);
  const editing = editingRevision !== null;
  const { run, pending, message } = useHall();
  return (
    <FestEditing.Provider value={allowed && editing}>
      {allowed && (
        <Button
          className="hall-editor"
          type="button"
          variant="outline"
          aria-pressed={editing}
          disabled={pending}
          onClick={() => setEditingRevision(editing ? null : revision)}
        >
          {editing ? "Bearbeitung schließen" : "Bearbeiten"}
        </Button>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (editingRevision === null || pending) return;
          const fields = new FormData(event.currentTarget);
          const text = (name: string) => String(fields.get(name) ?? "");
          const shifts = shiftIds.flatMap((id) => {
            const schedule = fields.has(fieldName(id, "start"))
              ? {
                  start: text(fieldName(id, "start")),
                  end: text(fieldName(id, "end")),
                  teamId: text(fieldName(id, "team")) || null,
                }
              : undefined;
            const people = fields.has(fieldName(id, "people"))
              ? {
                  names: fields.getAll(fieldName(id, "name")).map(String),
                  removedMemberIds: fields
                    .getAll(fieldName(id, "remove"))
                    .map(String),
                }
              : undefined;
            return schedule || people ? [{ id, schedule, people }] : [];
          });
          const tasks = fields.has("PURCHASE")
            ? Object.fromEntries(
                taskKinds.map((kind) => [
                  kind,
                  text(kind)
                    .split(/\r?\n/)
                    .map((name) => name.trim())
                    .filter(Boolean),
                ]),
              )
            : undefined;
          run(async () => {
            const response = await updateFest({
              id,
              revision: editingRevision,
              shifts,
              day: fields.has("day") ? text("day") : undefined,
              tasks,
            });
            if (!response.ok) throw new Error(response.error);
            setEditingRevision(null);
            return "Fest gespeichert.";
          });
        }}
      >
        <fieldset disabled={pending} className="hall-fest-fields">
          {editing && day !== undefined && (
            <label className="hall-editor hall-fest-date">
              Festdatum
              <input type="date" name="day" required defaultValue={day} />
            </label>
          )}
          {children}
          {allowed && editing && (
            <Button type="submit" className="hall-editor">
              {pending ? "Speichert …" : "Alle Änderungen speichern"}
            </Button>
          )}
        </fieldset>
        <Notice message={message} />
      </form>
      {!editing && extra}
    </FestEditing.Provider>
  );
}

export function FestTaskNames({
  initial,
}: {
  initial: Record<TaskKind, string[]>;
}) {
  if (!useContext(FestEditing)) return null;
  return (
    <div className="hall-editor hall-staffing-form">
      <h4>Verantwortliche eintragen</h4>
      {taskKinds.map((kind) => (
        <label key={kind}>
          {responsibility[kind]}
          <textarea
            name={kind}
            rows={2}
            maxLength={16100}
            defaultValue={initial[kind].join("\n")}
            placeholder="Ein Name pro Zeile"
          />
        </label>
      ))}
    </div>
  );
}

type StaffingShift = {
  id: string;
  teamId: string | null;
  start: string;
  end: string;
  team: { name: string } | null;
  requiredHelpers: number;
  helperNames: string[];
  members: Choice[];
};

export function StaffingRow({
  shift,
  time,
  teams,
  canChangeTeam,
  canEditPeople,
  notices,
}: {
  shift: StaffingShift;
  time: string;
  teams: Choice[];
  canChangeTeam: boolean;
  canEditPeople: boolean;
  notices: string[];
}) {
  const editing = useContext(FestEditing);
  const listed = [
    ...shift.members.map(({ name }) => name),
    ...shift.helperNames.filter(Boolean),
  ];
  const open = Math.max(0, shift.requiredHelpers - listed.length);
  return (
    <tr>
      <td data-label="Schicht">
        {time}
        {editing && canChangeTeam && (
          <div className="hall-editor hall-staffing-form">
            <label>
              Beginn
              <input
                type="time"
                name={fieldName(shift.id, "start")}
                required
                defaultValue={shift.start}
              />
            </label>
            <label>
              Ende
              <input
                type="time"
                name={fieldName(shift.id, "end")}
                required
                defaultValue={shift.end}
              />
            </label>
          </div>
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
                name={fieldName(shift.id, "team")}
                aria-label={`Mannschaft für ${time}`}
                defaultValue={shift.teamId ?? ""}
              >
                <option value="">Keine Mannschaft</option>
                <TeamOptions options={teams} />
              </select>
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
        {editing && canEditPeople && <ShiftPeopleFields shift={shift} />}
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

function ShiftPeopleFields({ shift }: { shift: StaffingShift }) {
  const [names, setNames] = useState(shift.helperNames);
  const [removed, setRemoved] = useState<string[]>([]);
  const linkedCount = shift.members.length - removed.length;
  const freeFields = Math.max(0, shift.requiredHelpers - linkedCount);
  return (
    <details className="hall-editor">
      <summary>Personen bearbeiten</summary>
      <fieldset className="hall-staffing-form">
        <input type="hidden" name={fieldName(shift.id, "people")} value="1" />
        {shift.members.map(({ id, name }, index) => (
          <label className="hall-staffing-linked" key={id}>
            <input
              type="checkbox"
              name={fieldName(shift.id, "remove")}
              value={id}
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
            Person {linkedCount + index + 1}
            <input
              type="text"
              name={fieldName(shift.id, "name")}
              autoComplete="off"
              maxLength={160}
              placeholder="Offener Platz"
              value={names[index] ?? ""}
              onChange={(event) => {
                const value = event.target.value;
                setNames((current) =>
                  Array.from(
                    { length: Math.max(current.length, index + 1) },
                    (_, i) => (i === index ? value : (current[i] ?? "")),
                  ),
                );
              }}
            />
          </label>
        ))}
        <p className="form-note" aria-live="polite">
          {linkedCount +
            names.slice(0, freeFields).filter((name) => name.trim()).length}
          /{shift.requiredHelpers} Personen eingetragen
        </p>
      </fieldset>
    </details>
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
