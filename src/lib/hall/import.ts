import { inflateRawSync } from "node:zlib";
import { parse } from "csv-parse/sync";
import { z } from "zod";
import { dutyTime } from "../duty-input";
import { hallDay } from "./planner";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const importRowSchema = z.object({
  date: hallDay,
  time,
  end: time.or(z.literal("")),
  home: z.string().trim().min(1).max(160),
  away: z.string().trim().min(1).max(160),
  venue: z.string().trim().min(1).max(160),
  number: z.string().trim().max(80),
  teamLabel: z.string().trim().max(160),
  teamId: z.string().min(1).max(100),
  ownHome: z.boolean(),
});
export type ImportRow = z.infer<typeof importRowSchema>;
const normalize = (value: string) =>
  value.normalize("NFKC").trim().toLocaleLowerCase("de").replace(/\s+/g, " ");
const header = (value: string) =>
  normalize(value).replace(/[^a-z0-9äöüß]/g, "");
const text = (value: unknown) =>
  value instanceof Date
    ? value.toISOString()
    : typeof value === "string" || typeof value === "number"
      ? String(value).trim()
      : "";

function asDate(value: string) {
  const german = value.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2}|\d{4})$/);
  if (german)
    return `${german[3].length === 2 ? "20" : ""}${german[3]}-${german[2].padStart(2, "0")}-${german[1].padStart(2, "0")}`;
  if (/^\d{4}-\d\d-\d\dT/.test(value)) return value.slice(0, 10);
  if (/^\d{5}(\.\d+)?$/.test(value))
    return new Date(
      Date.UTC(1899, 11, 30) + Math.floor(Number(value)) * 86400000,
    )
      .toISOString()
      .slice(0, 10);
  return value;
}
function asTime(value: string) {
  if (/^\d{4}-\d\d-\d\dT/.test(value)) return value.slice(11, 16);
  if (/^0\.\d+$/.test(value) || value === "0") {
    const total = Math.round(Number(value) * 1440) % 1440;
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  }
  const local = value.match(/^(\d{1,2}):(\d{2})(?::\d{2})?(?:\s*Uhr)?$/i);
  return local ? local[1].padStart(2, "0") + ":" + local[2] : value;
}

export function rowsFromTable(table: unknown[][]): ImportRow[] {
  const labels = {
    date: ["datum", "date", "spieltag"],
    time: [
      "uhrzeit",
      "time",
      "zeit",
      "beginn",
      "spielbeginn",
      "anwurf",
      "start",
    ],
    end: ["ende", "spielende", "end"],
    home: ["heim", "heimmannschaft", "heimteam", "home"],
    away: ["gast", "gastmannschaft", "gastteam", "away"],
    venue: ["halle", "spielort", "sporthalle", "ort", "venue", "hallenname"],
    number: ["spielnummer", "spielnr", "spiel", "nr", "nummer", "number"],
    teamLabel: ["mannschaft", "team", "vereinsmannschaft"],
    side: [
      "heimspiel",
      "seite",
      "heimoder auswärts",
      "ownhome",
      "heimspielauswärts",
    ],
  };
  const keys = Object.keys(labels) as (keyof typeof labels)[];
  const first = table.findIndex((row) => {
    const cells = row.map((item) => header(text(item)));
    return (
      labels.date.some((alias) => cells.includes(alias)) &&
      labels.home.some((alias) => cells.includes(alias))
    );
  });
  if (first < 0)
    throw new Error(
      "Die Spalten Datum und Heim fehlen. Benutze die Importvorlage.",
    );
  const columns = table[first].map((item) => header(text(item)));
  const positions = Object.fromEntries(
    keys.map((key) => [
      key,
      columns.findIndex((name) => labels[key].includes(name)),
    ]),
  );
  return table
    .slice(first + 1)
    .filter((row) => row.some((item) => text(item)))
    .map((row) => {
      const get = (key: keyof typeof labels) => text(row[positions[key]]);
      const date = get("date");
      return {
        date: asDate(date),
        time: asTime(
          get("time") || (date.includes("T") ? date.slice(11, 16) : ""),
        ),
        end: asTime(get("end")),
        home: get("home"),
        away: get("away"),
        venue: get("venue"),
        number: get("number"),
        teamLabel: get("teamLabel"),
        teamId: "",
        ownHome: !/^(nein|auswärts|away|false|0)$/i.test(get("side")),
      };
    });
}
export function fixture(row: ImportRow) {
  const startsAt = dutyTime(row.date + "T" + row.time);
  let endsAt = new Date(+startsAt + 90 * 60000);
  if (row.end) {
    const day = new Date(row.date + "T12:00:00Z");
    if (row.end < row.time) day.setUTCDate(day.getUTCDate() + 1);
    endsAt = dutyTime(day.toISOString().slice(0, 10) + "T" + row.end);
  }
  if (endsAt <= startsAt || +endsAt - +startsAt > 12 * 3600000)
    throw new Error("Ungültiges Spielende.");
  const season =
    Number(row.date.slice(0, 4)) - Number(row.date.slice(5, 7) < "07");
  const identity = row.number
    ? ["number", season, row.teamId, normalize(row.number)]
    : [
        "fixture",
        row.teamId,
        startsAt.toISOString(),
        normalize(row.home),
        normalize(row.away),
      ];
  return {
    sourceKey: JSON.stringify(identity),
    number: row.number || null,
    teamId: row.teamId,
    home: row.home,
    away: row.away,
    venue: row.venue,
    ownHome: row.ownHome,
    startsAt,
    endsAt,
  };
}

function inspectWorkbook(data: Buffer) {
  const end = data.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0 || end + 22 > data.length)
    throw new Error("Ungültige Excel-Datei.");
  const entries = data.readUInt16LE(end + 10);
  let offset = data.readUInt32LE(end + 16);
  let expanded = 0;
  if (entries > 1000)
    throw new Error("Die Excel-Datei enthält zu viele Teile.");
  for (let i = 0; i < entries; i++) {
    if (offset + 46 > end || data.readUInt32LE(offset) !== 0x02014b50)
      throw new Error("Ungültige Excel-Datei.");
    const size = data.readUInt32LE(offset + 24);
    const compressed = data.readUInt32LE(offset + 20);
    const method = data.readUInt16LE(offset + 10);
    const local = data.readUInt32LE(offset + 42);
    if (local + 30 > end || data.readUInt32LE(local) !== 0x04034b50)
      throw new Error("Ungültige Excel-Datei.");
    const start =
      local +
      30 +
      data.readUInt16LE(local + 26) +
      data.readUInt16LE(local + 28);
    const limit = 20 * 1024 * 1024;
    if (
      start + compressed > end ||
      expanded + size > limit ||
      ![0, 8].includes(method)
    )
      throw new Error("Die entpackte Excel-Datei ist zu groß oder ungültig.");
    const actual =
      method === 0
        ? compressed
        : inflateRawSync(data.subarray(start, start + compressed), {
            maxOutputLength: Math.max(1, limit - expanded),
          }).length;
    if (actual !== size) throw new Error("Ungültige Excel-Datei.");
    expanded += actual;
    offset +=
      46 +
      data.readUInt16LE(offset + 28) +
      data.readUInt16LE(offset + 30) +
      data.readUInt16LE(offset + 32);
  }
}

export async function readSchedule(file: File) {
  if (file.size > 3 * 1024 * 1024 || !file.size)
    throw new Error("Dateien müssen zwischen 1 Byte und 3 MB groß sein.");
  const extension = file.name.toLowerCase().split(".").pop();
  let rows: ImportRow[] = [];
  const notes: string[] = [];
  if (extension === "csv") {
    const source = await file.text();
    const first = source.split(/\r?\n/).find((line) => line.trim()) ?? "";
    const delimiter = [";", "\t", ","].sort(
      (a, b) => first.split(b).length - first.split(a).length,
    )[0];
    rows = rowsFromTable(
      parse(source, {
        delimiter,
        bom: true,
        skip_empty_lines: true,
        relax_column_count: true,
        max_record_size: 16384,
        to: 1002,
      }),
    );
  } else if (extension === "xlsx") {
    const { Workbook } = await import("exceljs");
    const bytes = Buffer.from(await file.arrayBuffer());
    inspectWorkbook(bytes);
    const workbook = new Workbook();
    await workbook.xlsx.load(
      bytes as unknown as Parameters<typeof workbook.xlsx.load>[0],
    );
    for (const worksheet of workbook.worksheets) {
      if (worksheet.rowCount > 1001 || worksheet.columnCount > 80)
        throw new Error("Maximal 1.000 Zeilen und 80 Spalten je Excel-Blatt.");
      const table: unknown[][] = [];
      worksheet.eachRow((row) =>
        table.push(
          (row.values as unknown[])
            .slice(1)
            .map((cell) =>
              cell && typeof cell === "object" && "result" in cell
                ? cell.result
                : cell,
            ),
        ),
      );
      try {
        rows.push(...rowsFromTable(table));
      } catch {
        notes.push(
          `Excel-Blatt „${worksheet.name}“ hat keine erkennbaren Spielspalten.`,
        );
      }
    }
  } else if (extension === "pdf") {
    const data = new Uint8Array(await file.arrayBuffer());
    if (Buffer.from(data.subarray(0, 5)).toString() !== "%PDF-")
      throw new Error("Ungültige PDF-Datei.");
    const { PDFParse } = await import("pdf-parse");
    const pdf = new PDFParse({ data });
    try {
      const info = await pdf.getInfo();
      if (info.total > 40)
        throw new Error("PDF-Dateien dürfen höchstens 40 Seiten enthalten.");
      const { text } = await pdf.getText();
      const lines = text.split(/\r?\n/);
      const dated = lines.filter((line) =>
        /\d{1,2}[./]\d{1,2}[./]\d{2,4}|\d{4}-\d{2}-\d{2}/.test(line),
      );
      for (const line of dated) {
        const match = line.match(
          /(\d{1,2}[./]\d{1,2}[./](?:\d{4}|\d{2})|\d{4}-\d{2}-\d{2})\s*;?\s+(\d{1,2}:\d{2})/,
        );
        if (!match) continue;
        const tail = line
          .slice((match.index ?? 0) + match[0].length)
          .replace(/^\s*;?\s*/, "")
          .split(/\s{2,}|\t|\s*;\s*/);
        rows.push({
          date: asDate(match[1]),
          time: asTime(match[2]),
          end: "",
          home: tail[0] ?? "",
          away: tail[1] ?? "",
          venue: tail[2] ?? "",
          number: tail[3] ?? "",
          teamLabel: "",
          teamId: "",
          ownHome: true,
        });
      }
      if (dated.length !== rows.length || rows.some((r) => !r.away || !r.venue))
        notes.push(
          "Einige PDF-Zeilen waren nicht eindeutig. Bitte mit der Originaldatei abgleichen und ergänzen.",
        );
    } finally {
      await pdf.destroy();
    }
  } else throw new Error("Unterstützt werden CSV, Excel (.xlsx) und PDF.");
  if (!rows.length)
    throw new Error(
      "Keine Spiele erkannt. Bei gescannten oder unstrukturierten PDFs bitte die CSV-Vorlage verwenden.",
    );
  if (rows.length > 1000)
    throw new Error("Pro Import sind höchstens 1.000 Spiele möglich.");
  return { rows, notes };
}
