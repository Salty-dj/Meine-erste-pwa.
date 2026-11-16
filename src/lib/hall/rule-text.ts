import type { Options } from "./planner";

export function interpretRules(
  text: string,
  teams: { id: string; name: string }[],
) {
  const rules: Options["rules"] = [];
  const unmatched: string[] = [];
  const weekdays = [
    "sonntag",
    "montag",
    "dienstag",
    "mittwoch",
    "donnerstag",
    "freitag",
    "samstag",
  ];
  for (const line of text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)) {
    const lower = line.toLocaleLowerCase("de");
    const names = teams
      .filter(({ name }) => lower.includes(name.toLocaleLowerCase("de")))
      .sort((a, b) => b.name.length - a.name.length);
    const selected =
      lower.includes("jugend") && !names.length
        ? teams.filter(({ name }) => /jugend|\b[a-e][ -]?jugend/i.test(name))
        : names.slice(0, 1);
    const hard =
      /\bdarf\b|\bmuss\b|\bniemals\b/.test(lower) &&
      !/möglich|bevorzug/.test(lower);
    const weekday = weekdays.findIndex((day) => lower.includes(day));
    const rule =
      /selben tag|spieltag/.test(lower) && /spielt|eigen/.test(lower)
        ? { kind: "noMatchDay" as const, value: 0 }
        : /keine frühdienste|keinen frühdienst/.test(lower)
          ? { kind: "notBefore" as const, value: 720 }
          : /vormittag/.test(lower)
            ? { kind: "notAfter" as const, value: 720 }
            : weekday >= 0
              ? { kind: "weekday" as const, value: weekday }
              : null;
    if (rule && selected.length)
      for (const team of selected)
        rules.push({ teamId: team.id, hard, ...rule });
    else unmatched.push(line);
  }
  return { rules, unmatched };
}

// The optional provider only suggests rules. The planner receives validated structured data.
export type RuleProposalProvider = (input: {
  text: string;
  teams: { id: string; name: string }[];
}) => Promise<unknown>;

export async function proposeRules(
  text: string,
  teams: { id: string; name: string }[],
  provider?: RuleProposalProvider,
) {
  const local = interpretRules(text, teams);
  if (!provider) return local;
  try {
    const { rulesSchema } = await import("./planner");
    const parsed = rulesSchema.safeParse(await provider({ text, teams }));
    const ids = new Set(teams.map(({ id }) => id));
    if (parsed.success && parsed.data.every(({ teamId }) => ids.has(teamId)))
      return { rules: parsed.data, unmatched: local.unmatched };
  } catch {
    // Provider failure must not prevent local rule interpretation.
  }
  return local;
}
