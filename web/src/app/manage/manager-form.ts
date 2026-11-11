import "server-only";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Db } from "@/db";
import { UserError } from "@/lib/server/errors";
import { withManager, type Manager } from "@/lib/server/session";

export type FormState = { error?: string; success?: string; pin?: string; at?: number } | null;

const uuid = z.uuid();
const ID_FIELDS = ["id", "employeeId", "punchId", "itemId", "spotId", "supplierId", "countId"];
/** Pickers with a "none" choice, which submits an empty string. */
const OPTIONAL_ID_FIELDS = new Set(["supplierId"]);

export function text(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

/** Runs a manager-only change; known problems come back as a message instead of an error page. */
export async function managerForm(
  form: FormData,
  work: (manager: Manager, db: Db) => Promise<FormState | void>,
  options: { account?: boolean; paths?: string[] } = {},
): Promise<FormState> {
  try {
    for (const name of ID_FIELDS) {
      const value = form.get(name);
      if (value === null || (value === "" && OPTIONAL_ID_FIELDS.has(name))) continue;
      if (!uuid.safeParse(value).success) {
        throw new UserError("That item no longer exists. Refresh the page.");
      }
    }
    const result = await withManager((db, manager) => work(manager, db), { account: options.account });
    for (const path of options.paths ?? ["/manage"]) revalidatePath(path, "layout");
    return { ...(result ?? {}), at: Date.now() };
  } catch (error) {
    if (error instanceof UserError) return { error: error.message, at: Date.now() };
    throw error;
  }
}
