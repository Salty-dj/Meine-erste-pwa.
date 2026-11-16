import { expect, test } from "vitest";
import { can } from "../../src/lib/roles";
import {
  readSchedule,
  fixture,
  type ImportRow,
} from "../../src/lib/hall/import";
import {
  schedule,
  splitShifts,
  type Options,
  type Slot,
} from "../../src/lib/hall/planner";
import { proposeRules } from "../../src/lib/hall/rule-text";

const time = (hour: number, day = 12) => new Date(Date.UTC(2027, 0, day, hour));
const slot = (
  id: string,
  hour: number,
  teamId: string | null = null,
): Slot => ({
  id,
  teamId,
  locked: false,
  startsAt: time(hour),
  endsAt: time(hour + 1),
});
const options: Options = {
  from: "2027-01-01",
  to: "2027-01-31",
  before: 60,
  after: 30,
  duration: 150,
  people: 3,
  matchBefore: 30,
  matchAfter: 30,
  travel: 60,
  pause: 30,
  max: 8,
  teamIds: ["a", "b"],
  excluded: [],
  targets: {},
  blockedMemberIds: [],
  blocks: [],
  rules: [],
};

test("hall privileges do not confer permissions for accounts or other modules", () => {
  expect(can(["HALL_CATERING", "MEMBER"], "hall")).toBe(true);
  expect(can(["HALL_CATERING"], "accounts")).toBe(false);
  expect(can(["HALL_CATERING"], "club")).toBe(false);
  expect(can(["TEAM_MANAGER"], "hall")).toBe(false);
  expect(can(["CLUB_ADMIN"], "hall")).toBe(true);
});

test("manual shift generation retains a shorter final shift", () => {
  expect(
    splitShifts(time(8), time(14), 150).map(
      ({ startsAt, endsAt }) => (+endsAt - +startsAt) / 60000,
    ),
  ).toEqual([150, 150, 60]);
});

test("away travel, hard rules, team blocks, minimum rest and maximum are enforced", () => {
  const fixed = [slot("fixed", 8, "b")];
  const matches = [
    { teamId: "a", ownHome: false, startsAt: time(10), endsAt: time(11) },
  ];
  const optionsWithMax = { ...options, max: 1 };
  const result = schedule(
    [slot("first", 9), slot("second", 14)],
    matches,
    optionsWithMax,
    fixed,
  );
  expect(result).toEqual([
    {
      id: "first",
      teamId: null,
      conflict: expect.stringMatching(/Fahr.*Saisonmaximum/),
    },
    { id: "second", teamId: "a", conflict: "" },
  ]);
  const blocked = schedule([slot("early", 13)], [], {
    ...options,
    max: 2,
    blocks: [
      { teamId: "a", start: "2027-01-12T13:00", end: "2027-01-12T17:00" },
    ],
    rules: [{ teamId: "b", kind: "weekday", value: 6, hard: true }],
  });
  expect(blocked[0]).toMatchObject({
    teamId: null,
    conflict: "Sperrtermin · Verbindliche Zusatzregel",
  });
  expect(
    schedule([slot("rest", 9)], [], { ...options, teamIds: ["b"] }, fixed)[0]
      .conflict,
  ).toContain("Mindestpause");
});

test("fixed slots and locked openings are retained and equal teams rotate deterministically", () => {
  const fixed = slot("fixed", 8, "a");
  const slots = [
    fixed,
    { ...slot("lock", 12), locked: true },
    slot("x", 10),
    slot("y", 14),
    slot("z", 16),
  ];
  const plan = schedule(slots, [], options);
  expect(plan.map(({ id, teamId }) => [id, teamId])).toEqual([
    ["x", "b"],
    ["y", "a"],
    ["z", "b"],
  ]);
  expect(schedule([...slots].reverse(), [], options)).toEqual(plan);
});

test("free text proposes editable preferences and rejects invalid optional provider output", async () => {
  const teams = [
    { id: "a", name: "Männer 1" },
    { id: "b", name: "Frauen 1" },
  ];
  const result = await proposeRules(
    "Männer 1 soll möglichst keine Frühdienste machen.\nFrauen 1 darf nicht am selben Tag Dienst machen, an dem sie spielt.",
    teams,
    async () => [{ teamId: "unknown", kind: "weekday", value: 4, hard: true }],
  );
  expect(result.rules).toEqual([
    { teamId: "a", kind: "notBefore", value: 720, hard: false },
    { teamId: "b", kind: "noMatchDay", value: 0, hard: true },
  ]);
});
const csv =
  "Datum;Beginn;Ende;Heim;Gast;Halle;Spielnummer;Mannschaft;Heimspiel\n17.01.2027;15:00;;TSV;Gast;Sporthalle;123;Männer 1;Ja";
function expectFixture(row: ImportRow) {
  expect(row).toMatchObject({
    date: "2027-01-17",
    home: "TSV",
    time: "15:00",
    number: "123",
  });
  const saved = fixture({ ...row, teamId: "a" });
  expect(saved.startsAt.toISOString()).toBe("2027-01-17T14:00:00.000Z");
  expect(saved.endsAt.toISOString()).toBe("2027-01-17T15:30:00.000Z");
}
test("CSV import captures team labels, local times and estimated end", async () => {
  const result = await readSchedule(new File([csv], "spielplan.csv"));
  expectFixture(result.rows[0]);
});
test("XLSX import handles formatted dates and numeric time cells", async () => {
  const { Workbook } = await import("exceljs");
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet("Spiele");
  sheet.addRow(csv.split("\n")[0].split(";"));
  sheet.addRow([
    new Date("2027-01-17T00:00:00Z"),
    0.625,
    "",
    "TSV",
    "Gast",
    "Sporthalle",
    123,
    "Männer 1",
    "Ja",
  ]);
  const bytes = new Uint8Array(await workbook.xlsx.writeBuffer());
  const result = await readSchedule(new File([bytes], "spielplan.xlsx"));
  expectFixture(result.rows[0]);
});
test("PDF with a text layer produces a preview row", async () => {
  const stream =
    "BT /F1 12 Tf 30 700 Td (17.01.2027 15:00; TSV; Gast; Sporthalle; 123) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = objects.map((object, i) => {
    const offset = pdf.length;
    pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const xref = pdf.length;
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.map((offset) => String(offset).padStart(10, "0") + " 00000 n \n").join("")}trailer\n<< /Root 1 0 R /Size 6 >>\nstartxref\n${xref}\n%%EOF\n`;
  const result = await readSchedule(new File([pdf], "spielplan.pdf"));
  expectFixture(result.rows[0]);
});
