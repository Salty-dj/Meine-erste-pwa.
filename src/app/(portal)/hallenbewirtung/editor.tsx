"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { runHallCommand, setHallRole } from "./actions";

export type Choice = { id: string; name: string };
export type ShiftEdit = {
  id: string | null;
  start: string;
  end: string;
  people: number;
  teamId: string | null;
  memberIds: string[];
  locked: boolean;
};
export type PlanEdit = {
  id: string;
  revision: number;
  title: string;
  venue: string;
  notes: string;
  start: string;
  end: string;
  shifts: ShiftEdit[];
  tasks: { PURCHASE: string[]; OPEN: string[]; CLOSE: string[] };
};
export const responsibility = {
  PURCHASE: "Einkauf",
  OPEN: "Aufmachen",
  CLOSE: "Zumachen",
};
export function useHall() {
  const router = useRouter();
  const [message, setMessage] = useState<{
    text: string;
    error?: boolean;
  } | null>(null);
  const [pending, start] = useTransition();
  const run = (operation: () => Promise<string>, refresh = true) => {
    setMessage(null);
    start(async () => {
      try {
        setMessage({ text: await operation() });
        if (refresh) router.refresh();
      } catch (error) {
        setMessage({
          error: true,
          text:
            error instanceof Error ? error.message : "Änderung fehlgeschlagen.",
        });
      }
    });
  };
  return { run, pending, message };
}
export function Notice({
  message,
}: {
  message: ReturnType<typeof useHall>["message"];
}) {
  if (!message) return null;
  return (
    <p
      role={message.error ? "alert" : "status"}
      className={`feedback ${message.error ? "error" : "success"}`}
    >
      {message.text}
    </p>
  );
}
export async function send(kind: string, data: unknown) {
  const response = await runHallCommand({ kind, data });
  if (!response.ok) throw new Error(response.error);
  return response.result;
}
export function TeamOptions({ options }: { options: Choice[] }) {
  return (
    <>
      {options.map(({ id, name }) => (
        <option key={id} value={id}>
          {name}
        </option>
      ))}
    </>
  );
}
export function PersonCheck({
  choices,
  value,
  onChange,
  children,
}: {
  choices: Choice[];
  value: string[];
  onChange: (value: string[]) => void;
  children?: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const filter = query.trim().toLocaleLowerCase("de");
  const listed = choices.filter(
    (choice) =>
      value.includes(choice.id) ||
      choice.name.toLocaleLowerCase("de").includes(filter),
  );
  return (
    <details>
      <summary>
        {children} ({value.length})
      </summary>
      <label>
        Person suchen
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <div className="hall-choices">
        {listed.map(({ id, name }) => (
          <label className="check-label" key={id}>
            <input
              type="checkbox"
              checked={value.includes(id)}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...value, id]
                    : value.filter((item) => item !== id),
                )
              }
            />{" "}
            {name}
          </label>
        ))}
      </div>
    </details>
  );
}
export function CreatePlan() {
  const { run, pending, message } = useHall();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) ?? "");
    const start = value("date") + "T" + value("start");
    const end = (value("endDay") || value("date")) + "T" + value("end");
    run(async () => {
      const result = await send("create", {
        title: value("title"),
        venue: value("venue"),
        notes: value("notes"),
        start,
        end,
        duration: Number(value("duration")),
        people: Number(value("people")),
      });
      if ("id" in result) window.location.hash = result.id;
      return "Dienstplan als Entwurf gespeichert.";
    });
  }
  return (
    <details className="panel padded">
      <summary>Neuen Dienstplan erstellen</summary>
      <form className="stack" onSubmit={submit}>
        <div className="form-grid">
          <label>
            Termin
            <input name="title" required maxLength={160} />
          </label>
          <label>
            Halle
            <input name="venue" required maxLength={160} />
          </label>
          <label>
            Datum
            <input name="date" type="date" required />
          </label>
          <label>
            Beginn
            <input name="start" type="time" required />
          </label>
          <label>
            Ende
            <input name="end" type="time" required />
          </label>
          <label>
            Enddatum bei Mitternacht
            <input name="endDay" type="date" />
          </label>
          <label>
            Schichtlänge in Minuten
            <input
              name="duration"
              type="number"
              min={15}
              max={720}
              defaultValue={150}
              required
            />
          </label>
          <label>
            Personen pro Schicht
            <input
              name="people"
              type="number"
              min={1}
              max={100}
              defaultValue={3}
              required
            />
          </label>
        </div>
        <label>
          Notizen und Anforderungen
          <textarea name="notes" maxLength={3000} rows={3} />
        </label>
        <Button disabled={pending} type="submit">
          Schichten erzeugen und Entwurf speichern
        </Button>
        <Notice message={message} />
      </form>
    </details>
  );
}
export function PlanEditor({
  plan,
  teams,
  members,
}: {
  plan: PlanEdit;
  teams: Choice[];
  members: Choice[];
}) {
  const { run, pending, message } = useHall();
  const [data, set] = useState(plan);
  const [keys, setKeys] = useState(
    plan.shifts.map((shift, index) => shift.id ?? String(index)),
  );
  const field = <K extends keyof PlanEdit>(key: K, value: PlanEdit[K]) =>
    set((old) => ({ ...old, [key]: value }));
  const editShift = (index: number, value: Partial<ShiftEdit>) =>
    set((old) => ({
      ...old,
      shifts: old.shifts.map((shift, i) =>
        i === index ? { ...shift, ...value } : shift,
      ),
    }));
  return (
    <details className="hall-editor">
      <summary>Entwurf bearbeiten</summary>
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          run(async () => {
            await send("edit", data);
            return "Entwurf gespeichert.";
          });
        }}
      >
        <div className="form-grid">
          <label>
            Termin
            <input
              value={data.title}
              maxLength={160}
              required
              onChange={(e) => field("title", e.target.value)}
            />
          </label>
          <label>
            Halle
            <input
              value={data.venue}
              maxLength={160}
              required
              onChange={(e) => field("venue", e.target.value)}
            />
          </label>
          <label>
            Beginn
            <input
              type="datetime-local"
              value={data.start}
              required
              onChange={(e) => field("start", e.target.value)}
            />
          </label>
          <label>
            Ende
            <input
              type="datetime-local"
              value={data.end}
              required
              onChange={(e) => field("end", e.target.value)}
            />
          </label>
        </div>
        <label>
          Notizen
          <textarea
            value={data.notes}
            rows={3}
            maxLength={3000}
            onChange={(e) => field("notes", e.target.value)}
          />
        </label>
        <h4>Schichten</h4>
        {data.shifts.map((shift, index) => {
          const persistedLock = plan.shifts.find(
            ({ id }) => id && id === shift.id,
          )?.locked;
          return (
            <fieldset className="stack" key={keys[index]}>
              <legend>Schicht {index + 1}</legend>
              <div className="form-grid">
                <label>
                  Beginn
                  <input
                    type="datetime-local"
                    required
                    disabled={persistedLock}
                    value={shift.start}
                    onChange={(e) =>
                      editShift(index, { start: e.target.value })
                    }
                  />
                </label>
                <label>
                  Ende
                  <input
                    type="datetime-local"
                    required
                    disabled={persistedLock}
                    value={shift.end}
                    onChange={(e) => editShift(index, { end: e.target.value })}
                  />
                </label>
                <label>
                  Personenzahl
                  <input
                    type="number"
                    min={1}
                    max={100}
                    required
                    disabled={persistedLock}
                    value={shift.people}
                    onChange={(e) =>
                      editShift(index, { people: +e.target.value })
                    }
                  />
                </label>
                <label>
                  Mannschaft
                  <select
                    value={shift.teamId ?? ""}
                    disabled={persistedLock}
                    onChange={(e) =>
                      editShift(index, { teamId: e.target.value || null })
                    }
                  >
                    <option value="">Keine Mannschaft</option>
                    <TeamOptions options={teams} />
                  </select>
                </label>
              </div>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={shift.locked}
                  onChange={(e) =>
                    editShift(index, { locked: e.target.checked })
                  }
                />{" "}
                Schicht sperren
              </label>
              {!persistedLock && (
                <PersonCheck
                  choices={members}
                  value={shift.memberIds}
                  onChange={(memberIds) => editShift(index, { memberIds })}
                >
                  Mitglieder
                </PersonCheck>
              )}
              {!persistedLock && !shift.locked && data.shifts.length > 1 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    field(
                      "shifts",
                      data.shifts.filter((_, i) => i !== index),
                    );
                    setKeys(keys.filter((_, i) => i !== index));
                  }}
                >
                  Schicht aus Entwurf entfernen
                </Button>
              )}
            </fieldset>
          );
        })}
        <Button
          type="button"
          variant="outline"
          disabled={data.shifts.length >= 150}
          onClick={() => {
            field("shifts", [
              ...data.shifts,
              {
                id: null,
                start: data.start,
                end: data.end,
                people: 1,
                teamId: null,
                memberIds: [],
                locked: false,
              },
            ]);
            setKeys([...keys, crypto.randomUUID()]);
          }}
        >
          Schicht hinzufügen
        </Button>
        <h4>Verantwortlichkeiten</h4>
        {(Object.keys(responsibility) as (keyof typeof responsibility)[]).map(
          (kind) => (
            <PersonCheck
              key={kind}
              choices={members}
              value={data.tasks[kind]}
              onChange={(ids) => field("tasks", { ...data.tasks, [kind]: ids })}
            >
              {responsibility[kind]}
            </PersonCheck>
          ),
        )}
        <Button disabled={pending} type="submit">
          Entwurf speichern
        </Button>
        <Notice message={message} />
      </form>
    </details>
  );
}
export function Publish({
  id,
  revision,
  published,
}: {
  id: string;
  revision: number;
  published: boolean;
}) {
  const { run, pending, message } = useHall();
  return (
    <div className="hall-editor">
      <Button
        disabled={pending}
        type="button"
        variant="outline"
        onClick={() => {
          if (
            !window.confirm(
              published
                ? "Veröffentlichung zurücknehmen?"
                : "Diesen Dienstplan jetzt für die zugewiesenen Mitglieder veröffentlichen?",
            )
          )
            return;
          run(async () => {
            await send("publish", { id, revision, publish: !published });
            return published
              ? "Veröffentlichung zurückgenommen."
              : "Dienstplan veröffentlicht.";
          });
        }}
      >
        {published
          ? "Veröffentlichung zurücknehmen"
          : "Dienstplan veröffentlichen"}
      </Button>
      <Notice message={message} />
    </div>
  );
}
export function RoleManagement({
  accounts,
}: {
  accounts: (Choice & { enabled: boolean })[];
}) {
  const { run, pending, message } = useHall();
  return (
    <details className="panel padded">
      <summary>Rolle Hallenbewirtung vergeben oder entziehen</summary>
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          run(async () => {
            const result = await setHallRole(
              String(form.get("account")),
              form.get("enabled") === "grant",
            );
            if (!result.ok) throw new Error(result.error);
            return "Rolle gespeichert.";
          });
        }}
      >
        <label>
          Benutzerkonto
          <select name="account" required defaultValue="">
            <option value="" disabled>
              Bitte auswählen
            </option>
            {accounts.map(({ id, name, enabled }) => (
              <option key={id} value={id}>
                {name} {enabled ? "· Hallenbewirtung" : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          Änderung
          <select name="enabled">
            <option value="grant">Rolle vergeben</option>
            <option value="revoke">Rolle entziehen</option>
          </select>
        </label>
        <Button type="submit" disabled={pending}>
          Rolle speichern
        </Button>
        <Notice message={message} />
      </form>
    </details>
  );
}
export function PrintPlan() {
  return (
    <Button
      className="hall-editor"
      variant="outline"
      type="button"
      onClick={() => window.print()}
    >
      Drucken / als PDF speichern
    </Button>
  );
}
