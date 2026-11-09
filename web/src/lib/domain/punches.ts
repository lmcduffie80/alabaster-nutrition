export const punchKinds = ["clockIn", "clockOut", "breakStart", "breakEnd"] as const;
export type PunchKind = (typeof punchKinds)[number];
export type ClockStatus = "out" | "in" | "break";

/** A punch as it counts now: its time after any manager fix, with removed punches left out. */
export type EffectivePunch = { id: string; kind: PunchKind; at: Date; adjusted?: boolean };

const allowed: Record<ClockStatus, PunchKind[]> = {
  out: ["clockIn"],
  in: ["breakStart", "clockOut"],
  break: ["breakEnd", "clockOut"],
};

export function allowedPunches(status: ClockStatus): PunchKind[] {
  return allowed[status];
}

export function isAllowed(status: ClockStatus, kind: PunchKind) {
  return allowed[status].includes(kind);
}

export const punchVerb: Record<PunchKind, string> = {
  clockIn: "Clocked in",
  clockOut: "Clocked out",
  breakStart: "Break started",
  breakEnd: "Back from break",
};

export const punchLabel: Record<PunchKind, string> = {
  clockIn: "Clock in",
  clockOut: "Clock out",
  breakStart: "Break start",
  breakEnd: "Break end",
};

export type WorkShift = {
  clockIn: EffectivePunch;
  clockOut: EffectivePunch | null;
  breakMs: number;
  workedMs: number;
  onBreak: boolean;
};

export type ShiftBreakdown = {
  shifts: WorkShift[];
  /** Punches that don't fit the in → break → out order. Shown to the manager to fix; not counted. */
  orphans: EffectivePunch[];
};

/**
 * Group one employee's punches into worked shifts. An open shift (no clock-out yet)
 * counts time up to `now`. Clocking out during a break ends the break.
 */
export function buildShifts(punches: EffectivePunch[], now: Date): ShiftBreakdown {
  const sorted = [...punches].sort((a, b) => a.at.getTime() - b.at.getTime());
  const shifts: WorkShift[] = [];
  const orphans: EffectivePunch[] = [];
  let open: { clockIn: EffectivePunch; breakMs: number; breakStartedAt: Date | null } | null = null;

  const finish = (end: Date, clockOut: EffectivePunch | null): WorkShift => {
    const shift = open!;
    const openBreakMs = shift.breakStartedAt ? Math.max(0, end.getTime() - shift.breakStartedAt.getTime()) : 0;
    const breakMs = shift.breakMs + openBreakMs;
    return {
      clockIn: shift.clockIn,
      clockOut,
      breakMs,
      workedMs: Math.max(0, end.getTime() - shift.clockIn.at.getTime() - breakMs),
      onBreak: clockOut === null && shift.breakStartedAt !== null,
    };
  };

  for (const punch of sorted) {
    if (open === null) {
      if (punch.kind === "clockIn") open = { clockIn: punch, breakMs: 0, breakStartedAt: null };
      else orphans.push(punch);
      continue;
    }
    switch (punch.kind) {
      case "clockIn":
        orphans.push(punch);
        break;
      case "breakStart":
        if (open.breakStartedAt) orphans.push(punch);
        else open.breakStartedAt = punch.at;
        break;
      case "breakEnd":
        if (!open.breakStartedAt) orphans.push(punch);
        else {
          open.breakMs += punch.at.getTime() - open.breakStartedAt.getTime();
          open.breakStartedAt = null;
        }
        break;
      case "clockOut":
        shifts.push(finish(punch.at, punch));
        open = null;
        break;
    }
  }

  if (open) shifts.push(finish(now, null));
  return { shifts, orphans };
}

export function currentStatus(punches: EffectivePunch[], now: Date): ClockStatus {
  const last = buildShifts(punches, now).shifts.at(-1);
  if (!last || last.clockOut) return "out";
  return last.onBreak ? "break" : "in";
}

export function isMissingClockOut(shift: WorkShift, now: Date, missingClockOutHours: number) {
  return shift.clockOut === null && now.getTime() - shift.clockIn.at.getTime() > missingClockOutHours * 3_600_000;
}
