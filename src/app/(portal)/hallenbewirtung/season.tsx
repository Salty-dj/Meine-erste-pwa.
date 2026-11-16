"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { ImportRow } from "@/lib/hall/import";
import type { Options } from "@/lib/hall/planner";
import { parseHallRules, previewHallImport } from "./actions";
import {
  Notice,
  PersonCheck,
  TeamOptions,
  send,
  useHall,
  type Choice,
} from "./editor";

const template =
  "Datum;Beginn;Ende;Heim;Gast;Halle;Spielnummer;Mannschaft;Heimspiel\n21.11.2026;15:00;16:30;TSV Denkendorf Männer 1;Gastverein;Sporthalle;12345;Männer 1;Ja\n";
const templateUrl =
  "data:text/csv;charset=utf-8," + encodeURIComponent(template);
const blank: ImportRow = {
  date: "",
  time: "",
  end: "",
  home: "",
  away: "",
  venue: "",
  number: "",
  teamLabel: "",
  teamId: "",
  ownHome: true,
};

export function ImportSchedule({ teams }: { teams: Choice[] }) {
  const { run, pending, message } = useHall();
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const update = (index: number, patch: Partial<ImportRow>) =>
    setRows((items) =>
      items.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  return (
    <details className="panel padded">
      <summary>Saisonplanung – Spielplan importieren</summary>
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          run(async () => {
            const result = await previewHallImport(data);
            if ("error" in result) throw new Error(result.error);
            setRows(result.rows);
            setNotes(result.notes);
            return `${result.rows.length} Zeilen für die Vorschau geladen.`;
          }, false);
        }}
      >
        <label>
          CSV, Excel (.xlsx) oder PDF mit Text
          <input name="file" type="file" accept=".csv,.xlsx,.pdf" required />
        </label>
        <a href={templateUrl} download="spielplan-vorlage.csv">
          CSV-Vorlage herunterladen
        </a>
        <Button type="submit" disabled={pending}>
          Datei prüfen
        </Button>
      </form>
      <div className="stack hall-editor">
        {notes.map((note) => (
          <p key={note} className="feedback notice">
            {note}
          </p>
        ))}
        {rows.length > 0 && (
          <p>
            Bitte Vereinsmannschaft, Heim-/Auswärtsstatus und Spielort je Zeile
            prüfen. Ohne Spielende rechnet die Planung mit 90 Minuten.
          </p>
        )}
        {rows.map((row, index) => (
          <details key={index}>
            <summary>
              {index + 1}. {row.date} {row.time} · {row.home || "Heim"} –{" "}
              {row.away || "Gast"}
              {!row.teamId && " · Mannschaft zuordnen"}
            </summary>
            <div className="form-grid">
              {(
                [
                  ["date", "Datum", "date"],
                  ["time", "Spielbeginn", "time"],
                  ["end", "Spielende", "time"],
                  ["home", "Heim", "text"],
                  ["away", "Gast", "text"],
                  ["venue", "Halle", "text"],
                  ["number", "Spielnummer", "text"],
                ] as const
              ).map(([key, label, type]) => (
                <label key={key}>
                  {label}
                  <input
                    type={type}
                    value={row[key]}
                    onChange={(e) => update(index, { [key]: e.target.value })}
                  />
                </label>
              ))}
              <label>
                Vereinsmannschaft
                <select
                  value={row.teamId}
                  onChange={(e) => update(index, { teamId: e.target.value })}
                >
                  <option value="">Bitte zuordnen</option>
                  <TeamOptions options={teams} />
                </select>
              </label>
            </div>
            {row.teamLabel && (
              <p className="muted">Mannschaft in der Datei: {row.teamLabel}</p>
            )}
            <label className="check-label">
              <input
                type="checkbox"
                checked={row.ownHome}
                onChange={(e) => update(index, { ownHome: e.target.checked })}
              />{" "}
              Heimspiel des TSV
            </label>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRows(rows.filter((_, i) => i !== index))}
            >
              Zeile verwerfen
            </Button>
          </details>
        ))}
        <Button
          type="button"
          variant="outline"
          disabled={rows.length >= 1000}
          onClick={() => setRows([...rows, { ...blank }])}
        >
          Spiel manuell ergänzen
        </Button>
        {rows.length > 0 && (
          <Button
            type="button"
            disabled={pending}
            onClick={() =>
              run(async () => {
                const result = await send("import", rows);
                if (!("inserted" in result))
                  throw new Error("Import fehlgeschlagen.");
                setRows([]);
                setNotes([]);
                return `${result.inserted} Spiele übernommen, ${result.duplicates} bereits vorhandene übersprungen.`;
              })
            }
          >
            Geprüfte Spiele übernehmen
          </Button>
        )}
        <Notice message={message} />
      </div>
    </details>
  );
}

const parameters = [
  ["before", "Minuten vor dem ersten Heimspiel", 60, 0, 720],
  ["after", "Minuten nach dem letzten Heimspiel", 30, 0, 720],
  ["duration", "Schichtlänge in Minuten", 150, 15, 720],
  ["people", "Personen pro Schicht", 3, 1, 100],
  ["matchBefore", "Sperrzeit vor eigenem Spiel in Minuten", 60, 0, 720],
  ["matchAfter", "Sperrzeit nach eigenem Spiel in Minuten", 30, 0, 720],
  [
    "travel",
    "Zusätzliche Fahrt-/Pufferzeit je Weg bei Auswärtsspielen",
    60,
    0,
    720,
  ],
  ["pause", "Mindestpause zwischen Diensten in Minuten", 30, 0, 720],
  ["max", "Maximale Dienste je Mannschaft im Zeitraum", 20, 1, 500],
] as const;
const rulesLabel = {
  noMatchDay: "Kein Dienst am eigenen Spieltag",
  notBefore: "Beginn nicht vor Uhrzeit",
  notAfter: "Ende nicht nach Uhrzeit",
  weekday: "Nur an diesem Wochentag",
};
const weekdays = [
  "Sonntag",
  "Montag",
  "Dienstag",
  "Mittwoch",
  "Donnerstag",
  "Freitag",
  "Samstag",
];
const asTime = (value: number) =>
  `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;

export function SeasonPlanner({
  teams,
  members,
  from,
  to,
}: {
  teams: Choice[];
  members: Choice[];
  from: string;
  to: string;
}) {
  const { run, pending, message } = useHall();
  const [blocks, setBlocks] = useState<Options["blocks"]>([]);
  const [blockedMemberIds, setBlocked] = useState<string[]>([]);
  const [rules, setRules] = useState<Options["rules"]>([]);
  const [text, setText] = useState("");
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const editRule = (i: number, patch: Partial<Options["rules"][number]>) =>
    setRules(rules.map((rule, j) => (i === j ? { ...rule, ...patch } : rule)));
  const editBlock = (i: number, patch: Partial<Options["blocks"][number]>) =>
    setBlocks(
      blocks.map((block, j) => (i === j ? { ...block, ...patch } : block)),
    );
  return (
    <details className="panel padded">
      <summary>Dienstplan automatisch generieren</summary>
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const numbers = Object.fromEntries(
            parameters.map(([key]) => [key, Number(form.get(key))]),
          );
          const targets = Object.fromEntries(
            teams.flatMap(({ id }) =>
              form.get(`target-${id}`) === ""
                ? []
                : [[id, Number(form.get(`target-${id}`))]],
            ),
          );
          run(async () => {
            const result = await send("generate", {
              ...numbers,
              from: form.get("from"),
              to: form.get("to"),
              teamIds: form.getAll("allowed"),
              excluded: form.getAll("excluded"),
              targets,
              blocks,
              rules,
              blockedMemberIds,
            });
            if (!("assigned" in result))
              throw new Error("Planung fehlgeschlagen.");
            return `${result.created} neue Entwürfe, ${result.assigned} Schichten zugeordnet, ${result.unassigned} Schichten weiterhin offen.${result.skipped ? ` ${result.skipped} Spieltage wegen bestehender Hallenbelegung übersprungen.` : ""}`;
          });
        }}
      >
        <p>
          Die Planung erstellt Entwürfe und füllt offene, ungesperrte Schichten.
          Fest eingeplante Dienste bleiben bestehen.
        </p>
        <div className="form-grid">
          <label>
            Zeitraum von
            <input name="from" type="date" defaultValue={from} required />
          </label>
          <label>
            Zeitraum bis
            <input name="to" type="date" defaultValue={to} required />
          </label>
          {parameters.map(([key, label, value, min, max]) => (
            <label key={key}>
              {label}
              <input
                type="number"
                name={key}
                defaultValue={value}
                min={min}
                max={max}
                required
              />
            </label>
          ))}
        </div>
        <fieldset className="stack">
          <legend>Mannschaften und Wunschzahl</legend>
          {teams.map(({ id, name }) => (
            <div key={id} className="hall-team-row">
              <strong>{name}</strong>
              <label className="check-label">
                <input
                  type="checkbox"
                  name="allowed"
                  value={id}
                  defaultChecked
                />{" "}
                Einplanen
              </label>
              <label className="check-label">
                <input type="checkbox" name="excluded" value={id} />{" "}
                Ausschließen
              </label>
              <label>
                Soll-Dienste
                <input name={`target-${id}`} type="number" min={0} max={500} />
              </label>
            </div>
          ))}
        </fieldset>
        <fieldset className="stack">
          <legend>Ausnahmen und Sperren</legend>
          <PersonCheck
            choices={members}
            value={blockedMemberIds}
            onChange={setBlocked}
          >
            Gesperrte Mitglieder
          </PersonCheck>
          {blocks.map((block, index) => (
            <div className="form-grid" key={index}>
              <label>
                Mannschaft
                <select
                  value={block.teamId}
                  onChange={(e) => editBlock(index, { teamId: e.target.value })}
                >
                  <TeamOptions options={teams} />
                </select>
              </label>
              <label>
                Von
                <input
                  type="datetime-local"
                  value={block.start}
                  required
                  onChange={(e) => editBlock(index, { start: e.target.value })}
                />
              </label>
              <label>
                Bis
                <input
                  type="datetime-local"
                  value={block.end}
                  required
                  onChange={(e) => editBlock(index, { end: e.target.value })}
                />
              </label>
              <Button
                type="button"
                variant="outline"
                onClick={() => setBlocks(blocks.filter((_, i) => index !== i))}
              >
                Sperrtermin entfernen
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            disabled={!teams.length}
            onClick={() =>
              setBlocks([
                ...blocks,
                { teamId: teams[0].id, start: "", end: "" },
              ])
            }
          >
            Sperrtermin hinzufügen
          </Button>
        </fieldset>
        <fieldset className="stack">
          <legend>Zusatzregeln</legend>
          <label>
            Regeln als Text eingeben
            <textarea
              maxLength={3000}
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Männer 1 soll möglichst keine Frühdienste machen."
            />
          </label>
          <Button
            type="button"
            variant="outline"
            disabled={pending || !text.trim()}
            onClick={() =>
              run(async () => {
                const result = await parseHallRules(text);
                setRules([...rules, ...result.rules].slice(0, 120));
                setUnmatched(result.unmatched);
                return `${result.rules.length} Regelvorschläge erkannt. Bitte prüfen.`;
              }, false)
            }
          >
            Regelvorschläge aus Text erstellen
          </Button>
          {unmatched.length > 0 && (
            <p className="feedback notice">
              Nicht erkannt: {unmatched.join(" · ")}
            </p>
          )}
          {rules.map((rule, index) => (
            <div className="form-grid" key={index}>
              <label>
                Mannschaft
                <select
                  value={rule.teamId}
                  onChange={(e) => editRule(index, { teamId: e.target.value })}
                >
                  <TeamOptions options={teams} />
                </select>
              </label>
              <label>
                Regel
                <select
                  value={rule.kind}
                  onChange={(e) =>
                    editRule(index, {
                      kind: e.target.value as typeof rule.kind,
                      value: e.target.value === "weekday" ? 6 : 720,
                    })
                  }
                >
                  {Object.entries(rulesLabel).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              {rule.kind === "weekday" && (
                <label>
                  Wochentag
                  <select
                    value={rule.value}
                    onChange={(e) =>
                      editRule(index, { value: +e.target.value })
                    }
                  >
                    {weekdays.map((day, i) => (
                      <option value={i} key={day}>
                        {day}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {(rule.kind === "notBefore" || rule.kind === "notAfter") && (
                <label>
                  Uhrzeit
                  <input
                    type="time"
                    required
                    value={asTime(rule.value)}
                    onChange={(e) => {
                      const [h, m] = e.target.value.split(":").map(Number);
                      if (e.target.value)
                        editRule(index, { value: h * 60 + m });
                    }}
                  />
                </label>
              )}
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={rule.hard}
                  onChange={(e) => editRule(index, { hard: e.target.checked })}
                />{" "}
                Verbindlich
              </label>
              <Button
                type="button"
                variant="outline"
                onClick={() => setRules(rules.filter((_, i) => index !== i))}
              >
                Regel entfernen
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            disabled={!teams.length || rules.length >= 120}
            onClick={() =>
              setRules([
                ...rules,
                {
                  teamId: teams[0].id,
                  kind: "noMatchDay",
                  value: 0,
                  hard: true,
                },
              ])
            }
          >
            Regel manuell hinzufügen
          </Button>
        </fieldset>
        <Button type="submit" disabled={pending || !teams.length}>
          Dienstplan als Entwurf berechnen
        </Button>
        <Notice message={message} />
      </form>
    </details>
  );
}
