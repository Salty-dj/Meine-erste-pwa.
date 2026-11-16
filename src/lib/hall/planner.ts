import { z } from "zod";
import { dutyTime } from "../duty-input";

const minutes = (max: number) => z.number().int().min(0).max(max);
const id = z.string().min(1).max(100);
export const hallDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(value + "T12:00:00Z");
    return Number.isFinite(+date) && date.toISOString().startsWith(value);
  });
export const wall = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
export const rulesSchema = z
  .array(
    z
      .object({
        teamId: id,
        kind: z.enum(["noMatchDay", "notBefore", "notAfter", "weekday"]),
        hard: z.boolean(),
        value: z.number().int().min(0).max(1440),
      })
      .refine((rule) => rule.kind !== "weekday" || rule.value <= 6),
  )
  .max(120);
const blockSchema = z
  .object({ teamId: id, start: wall, end: wall })
  .refine(({ start, end }) => start < end);
export const optionsSchema = z
  .object({
    from: hallDay,
    to: hallDay,
    before: minutes(720),
    after: minutes(720),
    duration: minutes(720).min(15),
    people: minutes(100).min(1),
    matchBefore: minutes(720),
    matchAfter: minutes(720),
    travel: minutes(720),
    pause: minutes(720),
    max: minutes(500).min(1),
    teamIds: z.array(id).max(150),
    excluded: z.array(id).max(150),
    targets: z.record(id, minutes(500)),
    blocks: z.array(blockSchema).max(300),
    blockedMemberIds: z.array(id).max(500),
    rules: rulesSchema,
  })
  .refine(
    ({ from, to }) =>
      from <= to && +new Date(to) - +new Date(from) <= 370 * 86400000,
    "Maximal eine Saison (370 Tage).",
  );
export type Options = z.infer<typeof optionsSchema>;
export type Match = {
  teamId: string;
  ownHome: boolean;
  startsAt: Date;
  endsAt: Date;
};
export type Span = { startsAt: Date; endsAt: Date };
export type Slot = Span & {
  id: string;
  teamId: string | null;
  locked: boolean;
};
const minute = 60000;
const berlin = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Berlin",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
export const wallValue = (date: Date) => berlin.format(date).replace(" ", "T");
export const dayOf = (date: Date) => wallValue(date).slice(0, 10);
export const wallMinutes = (date: Date) => {
  const [hours, mins] = wallValue(date).slice(11).split(":").map(Number);
  return hours * 60 + mins;
};
export function overlap(a: Span, b: Span, before = 0, after = before) {
  return (
    +a.startsAt < +b.endsAt + after * minute &&
    +a.endsAt > +b.startsAt - before * minute
  );
}
export function splitShifts(
  startsAt: Date,
  endsAt: Date,
  duration: number,
): Span[] {
  if (
    !(endsAt > startsAt) ||
    +endsAt - +startsAt > 36 * 60 * minute ||
    duration < 15
  )
    throw new Error(
      "Der Bewirtungszeitraum muss zwischen 1 Minute und 36 Stunden liegen.",
    );
  const slots: Span[] = [];
  for (let start = +startsAt; start < +endsAt; start += duration * minute)
    slots.push({
      startsAt: new Date(start),
      endsAt: new Date(Math.min(start + duration * minute, +endsAt)),
    });
  return slots;
}
function ruleApplies(
  rule: Options["rules"][number],
  slot: Span,
  matches: Match[],
) {
  switch (rule.kind) {
    case "noMatchDay":
      return matches.some(
        (match) => dayOf(match.startsAt) === dayOf(slot.startsAt),
      );
    case "notBefore":
      return wallMinutes(slot.startsAt) < rule.value;
    case "notAfter":
      return (
        dayOf(slot.startsAt) !== dayOf(slot.endsAt) ||
        wallMinutes(slot.endsAt) > rule.value
      );
    case "weekday":
      return (
        new Date(dayOf(slot.startsAt) + "T12:00:00Z").getUTCDay() !== rule.value
      );
  }
}
export function schedule(
  slots: Slot[],
  matches: Match[],
  config: Options,
  fixed: Slot[] = [],
) {
  const teamIds = [...new Set(config.teamIds)]
    .filter((team) => !config.excluded.includes(team))
    .sort();
  const assigned = [...fixed, ...slots.filter((slot) => slot.teamId)];
  const count = new Map<string, number>();
  const totals = new Map<string, number>();
  const inSeason = (slot: Span) => {
    const day = dayOf(slot.startsAt);
    return day >= config.from && day <= config.to;
  };
  const add = (slot: Slot) => {
    if (!slot.teamId || !inSeason(slot)) return;
    count.set(slot.teamId, (count.get(slot.teamId) ?? 0) + 1);
    totals.set(
      slot.teamId,
      (totals.get(slot.teamId) ?? 0) + (+slot.endsAt - +slot.startsAt) / minute,
    );
  };
  for (const slot of assigned) add(slot);
  const blocks = config.blocks.map(({ teamId, start, end }) => {
    const startsAt = dutyTime(start),
      endsAt = dutyTime(end);
    if (endsAt <= startsAt)
      throw new Error("Sperrzeit: Ende muss nach Beginn liegen.");
    return { teamId, startsAt, endsAt };
  });
  const byTeam = new Map(
    teamIds.map((teamId) => [
      teamId,
      matches.filter((match) => match.teamId === teamId),
    ]),
  );
  const rules = new Map(
    teamIds.map((teamId) => [
      teamId,
      config.rules.filter((rule) => rule.teamId === teamId),
    ]),
  );
  const reasons = (slot: Slot, teamId: string) => {
    const ownMatches = byTeam.get(teamId) ?? [];
    if (
      ownMatches.some((game) =>
        overlap(
          slot,
          game,
          config.matchBefore + (game.ownHome ? 0 : config.travel),
          config.matchAfter + (game.ownHome ? 0 : config.travel),
        ),
      )
    )
      return "Eigenes Spiel oder Fahr-/Pufferzeit";
    if (blocks.some((block) => block.teamId === teamId && overlap(slot, block)))
      return "Sperrtermin";
    if (
      (rules.get(teamId) ?? []).some(
        (rule) => rule.hard && ruleApplies(rule, slot, ownMatches),
      )
    )
      return "Verbindliche Zusatzregel";
    if ((count.get(teamId) ?? 0) >= config.max) return "Saisonmaximum erreicht";
    if (
      assigned.some(
        (other) =>
          other.teamId === teamId && overlap(slot, other, config.pause),
      )
    )
      return "Anderer Dienst oder Mindestpause";
    return "";
  };
  const score = (slot: Slot, teamId: string) => {
    const teamRules = rules.get(teamId) ?? [];
    const wishes = teamRules.filter(
      (rule) => !rule.hard && ruleApplies(rule, slot, byTeam.get(teamId) ?? []),
    ).length;
    const consecutive = assigned.some(
      (other) =>
        other.teamId === teamId &&
        (+other.endsAt === +slot.startsAt || +other.startsAt === +slot.endsAt),
    );
    const planned = count.get(teamId) ?? 0;
    const target = config.targets[teamId];
    return (
      (totals.get(teamId) ?? 0) / 60 +
      wishes * 2 +
      Number(consecutive) * 2 +
      (target === undefined
        ? 0
        : planned >= target
          ? 3 + planned - target
          : -2 * (target - planned))
    );
  };
  const pending = slots
    .filter((slot) => !slot.teamId && !slot.locked)
    .map((slot) => ({
      slot,
      initialCandidates: teamIds.filter((id) => !reasons(slot, id)).length,
    }))
    .sort(
      (a, b) =>
        a.initialCandidates - b.initialCandidates ||
        +a.slot.startsAt - +b.slot.startsAt ||
        a.slot.id.localeCompare(b.slot.id),
    );
  return pending.map(({ slot }) => {
    const candidates = teamIds
      .filter((team) => !reasons(slot, team))
      .sort((a, b) => score(slot, a) - score(slot, b) || a.localeCompare(b));
    const teamId = candidates[0] ?? null;
    if (!teamId) {
      const explanations = [
        ...new Set(teamIds.map((team) => reasons(slot, team)).filter(Boolean)),
      ];
      return {
        id: slot.id,
        teamId,
        conflict:
          explanations.join(" · ") ||
          "Keine Mannschaft für die Planung zugelassen",
      };
    }
    const allocation = { ...slot, teamId };
    assigned.push(allocation);
    add(allocation);
    return { id: slot.id, teamId, conflict: "" };
  });
}
