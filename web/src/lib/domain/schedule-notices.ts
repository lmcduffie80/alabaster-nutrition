/** Each employee's shifts for one week, as comparable strings. */
export type WeekSnapshot = Record<string, string[]>;

type SnapshotShift = { employeeId: string; startsAt: Date; endsAt: Date; position: string; calledInAt: Date | null };

export function shiftSignature(shift: Omit<SnapshotShift, "employeeId">) {
  return [shift.startsAt.toISOString(), shift.endsAt.toISOString(), shift.position, shift.calledInAt ? "called-in" : ""].join("|");
}

export function snapshotOf(shifts: SnapshotShift[]): WeekSnapshot {
  const snapshot: WeekSnapshot = {};
  for (const shift of shifts) (snapshot[shift.employeeId] ??= []).push(shiftSignature(shift));
  for (const list of Object.values(snapshot)) list.sort();
  return snapshot;
}

/** Everyone whose shifts differ between the two, including people who lost all their shifts. */
export function changedEmployees(before: WeekSnapshot | null, after: WeekSnapshot): string[] {
  const previous = before ?? {};
  return [...new Set([...Object.keys(previous), ...Object.keys(after)])].filter(
    (id) => (previous[id] ?? []).join("\n") !== (after[id] ?? []).join("\n"),
  );
}
