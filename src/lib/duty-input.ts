import { z } from "zod";

const id = z.string().trim().min(1).max(100);
const optionalId = id.or(z.literal("")).transform((value) => value || null);
const text = z.string().trim().min(1).max(120);
const localTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
const interval = { startsAt: localTime, endsAt: localTime };
const checkbox = z.preprocess((value) => value === "on", z.boolean());
const boundedInt = (min: number, max: number) =>
  z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .pipe(z.number().int().min(min).max(max));

export const dutyInput = z.discriminatedUnion("operation", [
  z.object({
    operation: z.literal("member"),
    id: optionalId,
    firstName: text,
    lastName: text,
    userId: optionalId,
    email: z.string().trim().max(254).email().or(z.literal("")),
    phone: z.string().trim().max(50),
    qualifications: z.string().max(500),
    teamIds: z.array(id).max(100),
    active: checkbox,
  }),
  z.object({
    operation: z.literal("team"),
    id: optionalId,
    name: text,
    ageGroup: z.string().trim().max(80),
    managerId: optionalId,
  }),
  z.object({ operation: z.literal("type"), name: text }),
  z.object({
    operation: z.literal("shift"),
    id: optionalId,
    typeId: id,
    teamId: optionalId,
    eventId: optionalId,
    location: text,
    ...interval,
    requiredHelpers: boundedInt(1, 100),
    occurrences: boundedInt(1, 26),
    voluntary: checkbox,
  }),
  z.object({
    operation: z.literal("assign"),
    shiftId: id,
    memberId: optionalId,
  }),
  z.object({
    operation: z.literal("shiftStatus"),
    shiftId: id,
    status: z.enum(["COMPLETED", "CANCELLED"]),
  }),
  z.object({
    operation: z.literal("minutes"),
    assignmentId: id,
    minutes: boundedInt(0, 1440),
  }),
  z.object({
    operation: z.literal("availability"),
    ...interval,
    available: checkbox,
  }),
  z.object({ operation: z.literal("swap"), assignmentId: id, memberId: id }),
  z.object({
    operation: z.literal("swapDecision"),
    swapId: id,
    decision: z.enum(["accept", "decline"]),
  }),
]);

export type DutyInput = z.infer<typeof dutyInput>;

const berlin = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Berlin",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export class DutyError extends Error {}

export function dutyTime(value: string, week = 0) {
  const date = new Date(value + ":00Z");
  if (!Number.isFinite(+date) || date.toISOString().slice(0, 16) !== value)
    throw new DutyError("Bitte gib ein gültiges Datum ein.");
  date.setUTCDate(date.getUTCDate() + 7 * week);
  const wallTime = date.toISOString().slice(0, 16).replace("T", " ");
  const matches = [1, 2]
    .map((offset) => new Date(+date - offset * 3_600_000))
    .filter((candidate) => berlin.format(candidate) === wallTime);
  if (matches.length !== 1)
    throw new DutyError(
      "Die Uhrzeit ist wegen der Zeitumstellung ungültig oder mehrdeutig.",
    );
  return matches[0];
}

export function dutyInterval(
  input: { startsAt: string; endsAt: string },
  week = 0,
) {
  const startsAt = dutyTime(input.startsAt, week);
  const endsAt = dutyTime(input.endsAt, week);
  if (endsAt <= startsAt)
    throw new DutyError("Das Ende muss nach dem Beginn liegen.");
  return { startsAt, endsAt };
}
