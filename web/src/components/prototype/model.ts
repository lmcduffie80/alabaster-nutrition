import { useCallback, useEffect, useRef, useState } from "react";
import {
  CURRENT_EMPLOYEE_ID,
  employeeName,
  employees,
  formatShiftDay,
  formatShiftTime,
  initialManagerPin,
  initialPins,
  initialRequests,
  initialShifts,
  isSimplePin,
  type Request,
  type RequestKind,
  type Shift,
} from "./data";

export type ClockStatus = "out" | "in" | "break";
export type ClockAction = "clockIn" | "clockOut" | "breakStart" | "breakEnd";

export type Clock = {
  status: ClockStatus;
  clockedInAt: number | null;
  breakStartedAt: number | null;
  breakMs: number;
  lastShiftMs: number | null;
};

const idleClock: Clock = {
  status: "out",
  clockedInAt: null,
  breakStartedAt: null,
  breakMs: 0,
  lastShiftMs: null,
};

export function workedMs(clock: Clock, now: number) {
  if (clock.status === "out" || clock.clockedInAt === null) return 0;
  const currentBreak = clock.status === "break" && clock.breakStartedAt !== null ? now - clock.breakStartedAt : 0;
  return Math.max(0, now - clock.clockedInAt - clock.breakMs - currentBreak);
}

export function useAppModel() {
  const [now, setNow] = useState(0);
  const [shifts, setShifts] = useState<Shift[]>(initialShifts);
  const [requests, setRequests] = useState<Request[]>(initialRequests);
  const [approvals, setApprovals] = useState<Record<string, boolean>>({});
  const [pins, setPins] = useState<Record<string, string>>(initialPins);
  const [managerPin] = useState(initialManagerPin);
  const [clocks, setClocks] = useState<Record<string, Clock>>(() =>
    Object.fromEntries(employees.map((e) => [e.id, idleClock])),
  );
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const nextId = useRef(100);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(id);
      clearTimeout(toastTimer.current);
    };
  }, []);

  const notify = useCallback((message: string) => {
    clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  function makeId(prefix: string) {
    nextId.current += 1;
    return `${prefix}${nextId.current}`;
  }

  function employeeForPin(pin: string) {
    return Object.entries(pins).find(([, p]) => p === pin)?.[0] ?? null;
  }

  function resetPin(employeeId: string) {
    const used = new Set(Object.values(pins).concat(managerPin));
    let pin = "";
    do {
      pin = Math.floor(Math.random() * 10000).toString().padStart(4, "0");
    } while (used.has(pin) || isSimplePin(pin));
    setPins({ ...pins, [employeeId]: pin });
    notify(`New PIN for ${employeeName(employeeId)}: ${pin} (shown only once)`);
  }

  function clock(personId: string, action: ClockAction) {
    const t = Date.now();
    setNow(t);
    const current = clocks[personId];
    let next: Clock;
    switch (action) {
      case "clockIn":
        next = { ...idleClock, status: "in", clockedInAt: t };
        break;
      case "breakStart":
        next = { ...current, status: "break", breakStartedAt: t };
        break;
      case "breakEnd":
        next = {
          ...current,
          status: "in",
          breakMs: current.breakMs + (current.breakStartedAt ? t - current.breakStartedAt : 0),
          breakStartedAt: null,
        };
        break;
      case "clockOut":
        next = { ...idleClock, lastShiftMs: workedMs(current, t) };
        break;
    }
    setClocks({ ...clocks, [personId]: next });
  }

  function addDraftShift(employeeId: string, day: number) {
    setShifts([
      ...shifts,
      { id: makeId("s"), employeeId, day, start: 7, end: 13, position: "Opener", status: "draft" },
    ]);
  }

  function removeShift(shiftId: string) {
    setShifts(shifts.filter((s) => s.id !== shiftId));
  }

  function publishDrafts() {
    const drafts = shifts.filter((s) => s.status === "draft");
    if (drafts.length === 0) return;
    setShifts(shifts.map((s) => (s.status === "draft" ? { ...s, status: "published" } : s)));
    const people = new Set(drafts.map((s) => s.employeeId)).size;
    notify(`Schedule published · ${people} ${people === 1 ? "person" : "people"} notified`);
  }

  function submitRequest(kind: RequestKind, shift?: Shift) {
    const base = { id: makeId("r"), employeeId: CURRENT_EMPLOYEE_ID, status: "pending" as const };
    let request: Request;
    switch (kind) {
      case "timeOff":
        request = { ...base, kind, title: "Time off", detail: "Sat Nov 21 – Sun Nov 22 · Wedding" };
        break;
      case "availability":
        request = { ...base, kind, title: "Availability", detail: "Unavailable Saturdays before 10:00 AM" };
        break;
      case "swap":
        request = {
          ...base,
          kind,
          title: "Shift swap",
          detail: `${formatShiftDay(shift!)}, ${formatShiftTime(shift!)} · Offered to anyone`,
          shiftId: shift!.id,
        };
        break;
      case "openShift":
        request = {
          ...base,
          kind,
          title: "Open shift pickup",
          detail: `${formatShiftDay(shift!)}, ${formatShiftTime(shift!)}`,
          shiftId: shift!.id,
        };
        break;
    }
    setRequests([request, ...requests]);
    notify("Request sent to your manager");
  }

  function decideRequest(requestId: string, outcome: "approved" | "denied") {
    const request = requests.find((r) => r.id === requestId);
    if (!request) return;
    let nextRequests = requests.map((r) => (r.id === requestId ? { ...r, status: outcome } : r));

    if (outcome === "approved" && request.shiftId) {
      if (request.kind === "openShift") {
        setShifts(
          shifts.map((s) =>
            s.id === request.shiftId ? { ...s, employeeId: request.employeeId, status: "published" } : s,
          ),
        );
        nextRequests = nextRequests.map((r) =>
          r.id !== requestId && r.kind === "openShift" && r.shiftId === request.shiftId && r.status === "pending"
            ? { ...r, status: "denied" }
            : r,
        );
      } else if (request.kind === "swap") {
        setShifts(shifts.map((s) => (s.id === request.shiftId ? { ...s, employeeId: null, status: "open" } : s)));
      }
    }

    setRequests(nextRequests);
    notify(`${employeeName(request.employeeId)} notified · ${request.title} ${outcome}`);
  }

  function toggleApproval(employeeId: string) {
    setApprovals({ ...approvals, [employeeId]: !approvals[employeeId] });
  }

  return {
    now,
    shifts,
    requests,
    approvals,
    pins,
    managerPin,
    clocks,
    toast,
    notify,
    employeeForPin,
    resetPin,
    clock,
    addDraftShift,
    removeShift,
    publishDrafts,
    submitRequest,
    decideRequest,
    toggleApproval,
  };
}

export type AppModel = ReturnType<typeof useAppModel>;
