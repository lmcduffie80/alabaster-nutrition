export type Employee = { id: string; name: string; color: string; isManager?: boolean };

export const MANAGER_ID = "lee";
export const CURRENT_EMPLOYEE_ID = "ava";
export const TODAY = 0;

export const employees: Employee[] = [
  { id: "lee", name: "Lee", color: "#3e5c9a", isManager: true },
  { id: "ava", name: "Ava", color: "#7fa06a" },
  { id: "jordan", name: "Jordan", color: "#6f8fc7" },
  { id: "maya", name: "Maya", color: "#b8935a" },
];

export const initialPins: Record<string, string> = {
  lee: "4821",
  ava: "3906",
  jordan: "7152",
  maya: "5847",
};

export const initialManagerPin = "9036";

export function isSimplePin(pin: string) {
  const digits = pin.split("").map(Number);
  const steps = digits.slice(1).map((d, i) => d - digits[i]);
  return steps.every((s) => s === 0) || steps.every((s) => s === 1) || steps.every((s) => s === -1);
}

export const days = [
  { short: "Mon", date: "Nov 9" },
  { short: "Tue", date: "Nov 10" },
  { short: "Wed", date: "Nov 11" },
  { short: "Thu", date: "Nov 12" },
  { short: "Fri", date: "Nov 13" },
  { short: "Sat", date: "Nov 14" },
];

export type ShiftStatus = "draft" | "published" | "open";

export type Shift = {
  id: string;
  employeeId: string | null;
  day: number;
  start: number;
  end: number;
  position: string;
  status: ShiftStatus;
};

export const initialShifts: Shift[] = [
  { id: "s1", employeeId: "ava", day: 0, start: 7, end: 13, position: "Opener", status: "published" },
  { id: "s2", employeeId: "lee", day: 0, start: 9, end: 15, position: "Manager", status: "published" },
  { id: "s3", employeeId: "jordan", day: 0, start: 13, end: 19, position: "Closer", status: "published" },
  { id: "s4", employeeId: "maya", day: 1, start: 7, end: 13, position: "Opener", status: "published" },
  { id: "s5", employeeId: "ava", day: 1, start: 13, end: 19, position: "Closer", status: "published" },
  { id: "s6", employeeId: "lee", day: 2, start: 7, end: 13, position: "Manager", status: "published" },
  { id: "s7", employeeId: "jordan", day: 2, start: 13, end: 19, position: "Closer", status: "published" },
  { id: "s8", employeeId: "ava", day: 3, start: 7, end: 13, position: "Opener", status: "published" },
  { id: "s9", employeeId: "maya", day: 3, start: 13, end: 19, position: "Closer", status: "published" },
  { id: "s10", employeeId: "jordan", day: 4, start: 7, end: 13, position: "Opener", status: "published" },
  { id: "s11", employeeId: null, day: 4, start: 13, end: 19, position: "Closer", status: "open" },
  { id: "s12", employeeId: "maya", day: 5, start: 8, end: 14, position: "Opener", status: "draft" },
  { id: "s13", employeeId: "ava", day: 5, start: 14, end: 19, position: "Closer", status: "draft" },
];

export type RequestKind = "timeOff" | "availability" | "swap" | "openShift";
export type RequestStatus = "pending" | "approved" | "denied";

export type Request = {
  id: string;
  employeeId: string;
  kind: RequestKind;
  title: string;
  detail: string;
  status: RequestStatus;
  shiftId?: string;
  offDay?: number;
  conflict?: string;
};

export const initialRequests: Request[] = [
  {
    id: "r1",
    employeeId: "jordan",
    kind: "timeOff",
    title: "Time off",
    detail: "Fri Nov 13 · Family trip",
    status: "pending",
    offDay: 4,
    conflict: "Jordan is scheduled Fri Nov 13, 7:00 AM – 1:00 PM",
  },
  {
    id: "r2",
    employeeId: "maya",
    kind: "swap",
    title: "Shift swap",
    detail: "Thu Nov 12, 1:00 PM – 7:00 PM · Offered to anyone",
    status: "pending",
    shiftId: "s9",
  },
  {
    id: "r3",
    employeeId: "ava",
    kind: "availability",
    title: "Availability",
    detail: "Unavailable Wednesdays after 3:00 PM",
    status: "approved",
  },
];

export type Punch = { day: string; clockIn: string; clockOut: string; breakMinutes: number; minutes: number };

export const avaPunches: Punch[] = [
  { day: "Mon Nov 2", clockIn: "6:56 AM", clockOut: "1:04 PM", breakMinutes: 15, minutes: 353 },
  { day: "Tue Nov 3", clockIn: "12:58 PM", clockOut: "7:02 PM", breakMinutes: 15, minutes: 349 },
  { day: "Thu Nov 5", clockIn: "6:59 AM", clockOut: "1:00 PM", breakMinutes: 0, minutes: 361 },
  { day: "Fri Nov 6", clockIn: "1:00 PM", clockOut: "7:05 PM", breakMinutes: 15, minutes: 350 },
  { day: "Sat Nov 7", clockIn: "7:58 AM", clockOut: "2:01 PM", breakMinutes: 15, minutes: 348 },
];

export type TimesheetRow = { employeeId: string; minutes: number; adjustmentMinutes: number; note?: string; flag?: string };

export const lastPeriod = "Nov 2 – Nov 8";

export const timesheets: TimesheetRow[] = [
  { employeeId: "lee", minutes: 1890, adjustmentMinutes: 0 },
  { employeeId: "ava", minutes: avaPunches.reduce((sum, p) => sum + p.minutes, 0), adjustmentMinutes: 0 },
  {
    employeeId: "jordan",
    minutes: 2010,
    adjustmentMinutes: -15,
    note: "Forgot to clock out Thu; corrected to 7:00 PM",
  },
  { employeeId: "maya", minutes: 1620, adjustmentMinutes: 0, flag: "Location not verified · Sat 8:01 AM" },
];

export function employeeName(id: string | null) {
  return employees.find((e) => e.id === id)?.name ?? "Open";
}

export function employeeColor(id: string | null) {
  return employees.find((e) => e.id === id)?.color ?? "#9c7a3c";
}

export function formatHour(hour: number) {
  const h = Math.floor(hour);
  const minutes = Math.round((hour - h) * 60);
  const suffix = h >= 12 ? "PM" : "AM";
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}:${minutes.toString().padStart(2, "0")} ${suffix}`;
}

export function formatShiftTime(shift: Pick<Shift, "start" | "end">) {
  return `${formatHour(shift.start)} – ${formatHour(shift.end)}`;
}

export function formatShiftDay(shift: Pick<Shift, "day">) {
  const d = days[shift.day];
  return `${d.short} ${d.date}`;
}

export function formatMinutes(total: number) {
  const sign = total < 0 ? "−" : "";
  const abs = Math.abs(total);
  return `${sign}${Math.floor(abs / 60)}h ${(abs % 60).toString().padStart(2, "0")}m`;
}

export function formatTimer(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}
