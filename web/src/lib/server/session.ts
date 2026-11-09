import "server-only";
import { currentUser } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { findKiosk, type KioskDevice } from "./kiosk";
import { sign, verify } from "./secrets";
import { ensureOwner, findEmployeeByEmail, normalizeEmail } from "./team";

const KIOSK_COOKIE = "alabaster_kiosk";
const KIOSK_MANAGER_COOKIE = "alabaster_kiosk_manager";
const KIOSK_COOKIE_SECONDS = 365 * 24 * 3600;
export const KIOSK_MANAGER_SECONDS = 10 * 60;

export type Viewer =
  | { kind: "manager"; email: string; employeeId: string }
  | { kind: "employee"; email: string; employeeId: string; displayName: string }
  | { kind: "noAccess"; email: string | null };

function ownerEmail() {
  const value = process.env.OWNER_EMAIL;
  return value ? normalizeEmail(value) : null;
}

/** The signed-in person, by their verified email. `null` when nobody is signed in. */
export async function getViewer(): Promise<Viewer | null> {
  const user = await currentUser();
  if (!user) return null;
  const primary = user.primaryEmailAddress;
  if (!primary || primary.verification?.status !== "verified") return { kind: "noAccess", email: null };
  const email = normalizeEmail(primary.emailAddress);
  const db = await getDb();
  const owner = ownerEmail();
  if (owner && email === owner) {
    const employeeId = await ensureOwner(db, email, user.firstName ?? "");
    return { kind: "manager", email, employeeId };
  }
  const employee = await findEmployeeByEmail(db, email);
  if (employee) return { kind: "employee", email, employeeId: employee.id, displayName: employee.displayName };
  return { kind: "noAccess", email };
}

export async function currentKiosk(): Promise<KioskDevice | null> {
  const token = (await cookies()).get(KIOSK_COOKIE)?.value;
  return findKiosk(await getDb(), token);
}

export async function requireKiosk(): Promise<KioskDevice> {
  const kiosk = await currentKiosk();
  if (!kiosk) redirect("/kiosk");
  return kiosk;
}

export async function setKioskCookie(token: string) {
  (await cookies()).set(KIOSK_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: KIOSK_COOKIE_SECONDS,
  });
}

export async function clearKioskCookie() {
  const jar = await cookies();
  jar.delete(KIOSK_COOKIE);
  jar.delete(KIOSK_MANAGER_COOKIE);
}

type KioskManagerTicket = { kioskId: string; exp: number };

export async function startKioskManagerSession(kioskId: string, now = new Date()) {
  const ticket: KioskManagerTicket = { kioskId, exp: now.getTime() + KIOSK_MANAGER_SECONDS * 1000 };
  (await cookies()).set(KIOSK_MANAGER_COOKIE, sign(ticket), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: KIOSK_MANAGER_SECONDS,
  });
}

export async function endKioskManagerSession() {
  (await cookies()).delete(KIOSK_MANAGER_COOKIE);
}

export type Manager = {
  /** Recorded on audit rows and approvals. */
  actor: string;
  via: "account" | "kiosk";
};

/** The manager, signed in with their account or unlocked with the manager PIN on the store kiosk. */
export async function getManager(): Promise<Manager | null> {
  const viewer = await getViewer();
  if (viewer?.kind === "manager") return { actor: viewer.email, via: "account" };

  const ticket = verify<KioskManagerTicket>((await cookies()).get(KIOSK_MANAGER_COOKIE)?.value);
  if (!ticket || ticket.exp < Date.now()) return null;
  const kiosk = await currentKiosk();
  if (!kiosk || kiosk.id !== ticket.kioskId) return null;
  return { actor: `Manager PIN on ${kiosk.label}`, via: "kiosk" };
}

export async function requireManager(): Promise<Manager> {
  const manager = await getManager();
  if (!manager) redirect("/");
  return manager;
}

/** Account sign-in only; for things the kiosk's manager PIN shouldn't unlock, like enrolling devices. */
export async function requireManagerAccount(): Promise<Manager> {
  const manager = await getManager();
  if (manager?.via !== "account") redirect("/");
  return manager;
}
