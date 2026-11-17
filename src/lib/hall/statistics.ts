export function staffingTotals(
  shifts: { requiredHelpers: number; startsAt: Date; endsAt: Date }[],
) {
  let count = 0;
  let personMilliseconds = 0;
  for (const { requiredHelpers, startsAt, endsAt } of shifts) {
    count += requiredHelpers;
    personMilliseconds += requiredHelpers * (+endsAt - +startsAt);
  }
  return { count, hours: personMilliseconds / 3600000 };
}
