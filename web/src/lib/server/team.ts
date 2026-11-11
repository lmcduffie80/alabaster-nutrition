import "server-only";
import { and, asc, eq, isNotNull, ne } from "drizzle-orm";
import { z } from "zod";
import { schema, type Db } from "@/db";
import { pinProblem, pinProblemMessage } from "@/lib/domain/pins";
import { getBusiness } from "./business";
import { UserError } from "./errors";
import { pinDigest, randomPin } from "./secrets";

export const EMPLOYEE_COLOR_COUNT = 8;

export type Employee = {
  id: string;
  displayName: string;
  role: "manager" | "employee";
  colorIndex: number;
  active: boolean;
  email: string | null;
  hasPin: boolean;
};

const columns = {
  id: schema.employee.id,
  displayName: schema.employee.displayName,
  role: schema.employee.role,
  colorIndex: schema.employee.colorIndex,
  active: schema.employee.active,
  email: schema.employee.email,
  pinDigest: schema.employee.pinDigest,
};

function toEmployee({ pinDigest, ...row }: { pinDigest: string | null } & Omit<Employee, "hasPin">): Employee {
  return { ...row, hasPin: pinDigest !== null };
}

export async function listEmployees(db: Db, options: { includeInactive?: boolean } = {}): Promise<Employee[]> {
  const rows = await db
    .select(columns)
    .from(schema.employee)
    .where(options.includeInactive ? undefined : eq(schema.employee.active, true))
    .orderBy(asc(schema.employee.createdAt));
  return rows.map(toEmployee);
}

export async function getEmployee(db: Db, id: string): Promise<Employee | null> {
  const [row] = await db.select(columns).from(schema.employee).where(eq(schema.employee.id, id));
  return row ? toEmployee(row) : null;
}

export async function findEmployeeByEmail(db: Db, email: string): Promise<Employee | null> {
  const [row] = await db
    .select(columns)
    .from(schema.employee)
    .where(and(eq(schema.employee.email, normalizeEmail(email)), eq(schema.employee.active, true)));
  return row ? toEmployee(row) : null;
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

const nameSchema = z.string().trim().min(1, "Enter the employee's name.").max(60, "Keep the name under 60 characters.");
const emailSchema = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value.toLowerCase()))
  .pipe(z.email("Enter a valid email, or leave it blank.").max(254).nullable());

function parse<T>(schemaToUse: z.ZodType<T>, value: unknown): T {
  const result = schemaToUse.safeParse(value);
  if (!result.success) throw new UserError(result.error.issues[0]?.message ?? "Check the details and try again.");
  return result.data;
}

async function assertNameFree(db: Db, name: string, exceptId?: string) {
  const active = await listEmployees(db);
  const taken = active.some((e) => e.id !== exceptId && e.displayName.toLowerCase() === name.toLowerCase());
  if (taken) throw new UserError("Someone on the team already has that name. Add a last initial to tell them apart.");
}

async function assertEmailFree(db: Db, email: string | null, exceptId?: string) {
  if (!email) return;
  const [row] = await db.select({ id: schema.employee.id }).from(schema.employee).where(eq(schema.employee.email, email));
  if (row && row.id !== exceptId) throw new UserError("Another employee already uses that email.");
}

export async function addEmployee(db: Db, input: { displayName: string; email: string }) {
  const displayName = parse(nameSchema, input.displayName);
  const email = parse(emailSchema, input.email);
  await assertNameFree(db, displayName);
  await assertEmailFree(db, email);
  const everyone = await listEmployees(db, { includeInactive: true });
  const [created] = await db
    .insert(schema.employee)
    .values({ displayName, email, colorIndex: everyone.length % EMPLOYEE_COLOR_COUNT })
    .returning({ id: schema.employee.id });
  return created.id;
}

export async function updateEmployee(db: Db, id: string, input: { displayName: string; email: string }) {
  const displayName = parse(nameSchema, input.displayName);
  const email = parse(emailSchema, input.email);
  const current = await getEmployee(db, id);
  if (!current) throw new UserError("That employee no longer exists.");
  if (current.role === "manager" && email === null) throw new UserError("The manager needs an email to sign in.");
  if (current.role === "manager" && email !== current.email) {
    throw new UserError("Manager emails are set in the app's settings on Vercel (MANAGER_EMAILS).");
  }
  await assertNameFree(db, displayName, id);
  await assertEmailFree(db, email, id);
  await db.update(schema.employee).set({ displayName, email }).where(eq(schema.employee.id, id));
}

export async function setEmployeeActive(db: Db, id: string, active: boolean) {
  const current = await getEmployee(db, id);
  if (!current) throw new UserError("That employee no longer exists.");
  if (current.role === "manager" && !active) throw new UserError("The manager can't be deactivated.");
  if (active) await assertNameFree(db, current.displayName, id);
  // A returning employee gets a new PIN; their old one may have been given to someone else.
  await db
    .update(schema.employee)
    .set(active ? { active } : { active, pinDigest: null })
    .where(eq(schema.employee.id, id));
}

/** Creates a manager's own employee record on first sign-in, so managers can clock in too. */
export async function ensureOwner(db: Db, email: string, displayName: string) {
  const normalized = normalizeEmail(email);
  const [existing] = await db.select({ id: schema.employee.id }).from(schema.employee).where(eq(schema.employee.email, normalized));
  if (existing) {
    await db.update(schema.employee).set({ role: "manager", active: true }).where(eq(schema.employee.id, existing.id));
    return existing.id;
  }
  const everyone = await listEmployees(db, { includeInactive: true });
  const [created] = await db
    .insert(schema.employee)
    .values({
      displayName: displayName.trim() || "Manager",
      email: normalized,
      role: "manager",
      colorIndex: everyone.length % EMPLOYEE_COLOR_COUNT,
    })
    .returning({ id: schema.employee.id });
  return created.id;
}

async function assertPinFree(db: Db, digest: string, exceptEmployeeId?: string) {
  const business = await getBusiness(db);
  if (business.managerPinDigest === digest) throw new UserError("That PIN is already in use. Choose another.");
  const [row] = await db
    .select({ id: schema.employee.id })
    .from(schema.employee)
    .where(
      and(
        eq(schema.employee.pinDigest, digest),
        eq(schema.employee.active, true),
        exceptEmployeeId ? ne(schema.employee.id, exceptEmployeeId) : undefined,
      ),
    );
  if (row) throw new UserError("That PIN is already in use. Choose another.");
}

function checkPinRules(pin: string) {
  const problem = pinProblem(pin);
  if (problem) throw new UserError(pinProblemMessage[problem]);
}

export async function setEmployeePin(db: Db, employeeId: string, pin: string) {
  checkPinRules(pin);
  const employee = await getEmployee(db, employeeId);
  if (!employee?.active) throw new UserError("Only active employees can have a PIN.");
  const digest = pinDigest(pin);
  await assertPinFree(db, digest, employeeId);
  await db.update(schema.employee).set({ pinDigest: digest }).where(eq(schema.employee.id, employeeId));
}

/** Picks a random PIN that follows the rules and isn't taken. Returns it once; only its digest is stored. */
export async function assignRandomPin(db: Db, employeeId: string) {
  const taken = new Set(
    (
      await db
        .select({ digest: schema.employee.pinDigest })
        .from(schema.employee)
        .where(and(eq(schema.employee.active, true), isNotNull(schema.employee.pinDigest)))
    ).map((r) => r.digest),
  );
  const business = await getBusiness(db);
  if (business.managerPinDigest) taken.add(business.managerPinDigest);
  for (let attempt = 0; attempt < 200; attempt++) {
    const pin = randomPin();
    if (pinProblem(pin) || taken.has(pinDigest(pin))) continue;
    await setEmployeePin(db, employeeId, pin);
    return pin;
  }
  throw new UserError("Couldn't find a free PIN. Remove PINs from former employees and try again.");
}

export async function clearEmployeePin(db: Db, employeeId: string) {
  await db.update(schema.employee).set({ pinDigest: null }).where(eq(schema.employee.id, employeeId));
}

export async function setManagerPin(db: Db, pin: string) {
  checkPinRules(pin);
  const digest = pinDigest(pin);
  const [row] = await db
    .select({ id: schema.employee.id })
    .from(schema.employee)
    .where(and(eq(schema.employee.pinDigest, digest), eq(schema.employee.active, true)));
  if (row) throw new UserError("The manager PIN must be different from every employee's PIN.");
  const { id } = await getBusiness(db);
  await db.update(schema.business).set({ managerPinDigest: digest }).where(eq(schema.business.id, id));
}
