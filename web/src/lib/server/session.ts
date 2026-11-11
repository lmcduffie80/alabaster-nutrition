import "server-only";
import { currentUser } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { notFound, redirect, unstable_rethrow } from "next/navigation";
import { cache } from "react";
import { getDb, type Db } from "@/db";
import { withBusiness } from "@/db/tenant";
import { platformOwnerEmails } from "./invites";
import { sign, verify } from "./secrets";
import {
  businessesForEmail,
  ensureFirstBusinessManager,
  kioskByToken,
  type KioskDevice,
  type Membership,
} from "./system";
import { normalizeEmail } from "./team";

const KIOSK_COOKIE = "alabaster_kiosk";
const KIOSK_MANAGER_COOKIE = "alabaster_kiosk_manager";
const KIOSK_COOKIE_SECONDS = 365 * 24 * 3600;
export const KIOSK_MANAGER_SECONDS = 10 * 60;
const KIOSK_COUNT_COOKIE = "alabaster_kiosk_count";
export const COUNT_SESSION_SECONDS = 5 * 60;
const BUSINESS_COOKIE = "alabaster_business";

export type Viewer =
  | { kind: "manager"; email: string; employeeId: string; businessId: number; businessName: string }
  | { kind: "employee"; email: string; employeeId: string; displayName: string; businessId: number; businessName: string }
  | { kind: "chooseBusiness"; email: string; options: Membership[] }
  | { kind: "noAccess"; email: string | null };

export type Member = Extract<Viewer, { kind: "manager" | "employee" }>;

/** Comma-separated in `MANAGER_EMAILS`; everyone listed is a manager of the first business (Alabaster). */
export function managerEmails(value = process.env.MANAGER_EMAILS ?? ""): Set<string> {
  return new Set(value.split(",").map(normalizeEmail).filter(Boolean));
}

type BusinessChoice = { email: string; businessId: number };

/** Which business a person belongs to. Several businesses need a choice, which is re-checked every time. */
export function pickMembership(email: string, memberships: Membership[], choice: BusinessChoice | null): Viewer {
  if (memberships.length === 0) return { kind: "noAccess", email };
  const chosen =
    memberships.length === 1
      ? memberships[0]
      : choice?.email === email
        ? memberships.find((m) => m.businessId === choice.businessId)
        : undefined;
  if (!chosen) return { kind: "chooseBusiness", email, options: memberships };
  const base = { email, employeeId: chosen.employeeId, businessId: chosen.businessId, businessName: chosen.businessName };
  return chosen.role === "manager" ? { kind: "manager", ...base } : { kind: "employee", ...base, displayName: chosen.displayName };
}

export type SignedIn = { email: string | null; firstName: string };

/** The Clerk account, if any; `email` is null until it's verified. */
export const getSignedIn = cache(async (): Promise<SignedIn | null> => {
  const user = await currentUser();
  if (!user) return null;
  const primary = user.primaryEmailAddress;
  const verified = primary && primary.verification?.status === "verified";
  return { email: verified ? normalizeEmail(primary.emailAddress) : null, firstName: user.firstName ?? "" };
});

/** The signed-in person, by their verified email. `null` when nobody is signed in. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const signedIn = await getSignedIn();
  if (!signedIn) return null;
  const { email } = signedIn;
  if (!email) return { kind: "noAccess", email: null };
  const db = await getDb();
  if (managerEmails().has(email)) await ensureFirstBusinessManager(db, email, signedIn.firstName);
  const choice = verify<BusinessChoice>((await cookies()).get(BUSINESS_COOKIE)?.value);
  return pickMembership(email, await businessesForEmail(db, email), choice);
});

export async function chooseBusiness(businessId: number) {
  const email = (await getSignedIn())?.email;
  if (!email) redirect("/");
  const memberships = await businessesForEmail(await getDb(), email);
  if (!memberships.some((m) => m.businessId === businessId)) throw new Error("Not a member of that business.");
  (await cookies()).set(BUSINESS_COOKIE, sign({ email, businessId } satisfies BusinessChoice), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 365 * 24 * 3600,
  });
}

export const currentKiosk = cache(async (): Promise<KioskDevice | null> => {
  const token = (await cookies()).get(KIOSK_COOKIE)?.value;
  return kioskByToken(await getDb(), token);
});

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
  jar.delete(KIOSK_COUNT_COOKIE);
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

type CountTicket = { kioskId: string; employeeId: string; exp: number };

/** Lets an employee keep entering counts without retyping their PIN; extended on each entry. */
export async function startCountSession(kioskId: string, employeeId: string, now = new Date()) {
  const ticket: CountTicket = { kioskId, employeeId, exp: now.getTime() + COUNT_SESSION_SECONDS * 1000 };
  (await cookies()).set(KIOSK_COUNT_COOKIE, sign(ticket), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: COUNT_SESSION_SECONDS,
  });
}

export async function getCountSession(): Promise<{ kiosk: KioskDevice; employeeId: string } | null> {
  const ticket = verify<CountTicket>((await cookies()).get(KIOSK_COUNT_COOKIE)?.value);
  if (!ticket || ticket.exp < Date.now()) return null;
  const kiosk = await currentKiosk();
  if (!kiosk || kiosk.id !== ticket.kioskId) return null;
  return { kiosk, employeeId: ticket.employeeId };
}

export async function endCountSession() {
  (await cookies()).delete(KIOSK_COUNT_COOKIE);
}

export type Manager = {
  /** Recorded on audit rows and approvals. */
  actor: string;
  via: "account" | "kiosk";
  businessId: number;
};

/** The manager, signed in with their account or unlocked with the manager PIN on the store kiosk. */
export async function getManager(): Promise<Manager | null> {
  const viewer = await getViewer();
  if (viewer?.kind === "manager") return { actor: viewer.email, via: "account", businessId: viewer.businessId };

  const ticket = verify<KioskManagerTicket>((await cookies()).get(KIOSK_MANAGER_COOKIE)?.value);
  if (!ticket || ticket.exp < Date.now()) return null;
  const kiosk = await currentKiosk();
  if (!kiosk || kiosk.id !== ticket.kioskId) return null;
  return { actor: `Manager PIN on ${kiosk.label}`, via: "kiosk", businessId: kiosk.businessId };
}

export async function requireManager(): Promise<Manager> {
  const manager = await getManager();
  if (manager) return manager;
  if ((await getViewer())?.kind === "chooseBusiness") redirect("/choose-business");
  redirect("/");
}

/** Account sign-in only; for things the kiosk's manager PIN shouldn't unlock, like enrolling devices. */
export async function requireManagerAccount(): Promise<Manager> {
  const manager = await getManager();
  if (manager?.via !== "account") redirect("/");
  return manager;
}

/** The platform owner's pages: anyone else gets a plain 404. */
export async function requirePlatformOwner(): Promise<{ email: string; db: Db }> {
  const signedIn = await getSignedIn();
  if (!signedIn) redirect(`/sign-in?redirect_url=${encodeURIComponent("/platform/invites")}`);
  const email = signedIn.email;
  if (!email || !platformOwnerEmails().has(email)) notFound();
  return { email, db: await getDb() };
}

// Every request's database work goes through one of these, inside its business's walls.

function isNavigation(error: unknown) {
  try {
    unstable_rethrow(error);
    return false;
  } catch {
    return true;
  }
}

/** `redirect()` and `notFound()` throw; the work before them is kept rather than rolled back. */
async function walled<T>(businessId: number, work: (db: Db) => Promise<T>): Promise<T> {
  const outcome = await withBusiness(await getDb(), businessId, async (db) => {
    try {
      return { value: await work(db) };
    } catch (error) {
      if (isNavigation(error)) return { navigation: error };
      throw error;
    }
  });
  if ("navigation" in outcome) throw outcome.navigation;
  return outcome.value;
}

export async function withManager<T>(work: (db: Db, manager: Manager) => Promise<T>, options: { account?: boolean } = {}) {
  const manager = options.account ? await requireManagerAccount() : await requireManager();
  return walled(manager.businessId, (db) => work(db, manager));
}

/** For routes that answer 403 instead of redirecting. */
export async function withManagerOrNull<T>(work: (db: Db, manager: Manager) => Promise<T>): Promise<T | null> {
  const manager = await getManager();
  if (!manager) return null;
  return walled(manager.businessId, (db) => work(db, manager));
}

export async function withMember<T>(work: (db: Db, member: Member) => Promise<T>) {
  const viewer = await getViewer();
  if (viewer?.kind === "chooseBusiness") redirect("/choose-business");
  if (viewer?.kind !== "manager" && viewer?.kind !== "employee") redirect("/");
  return walled(viewer.businessId, (db) => work(db, viewer));
}

export async function withKiosk<T>(kiosk: KioskDevice, work: (db: Db) => Promise<T>) {
  return walled(kiosk.businessId, work);
}
