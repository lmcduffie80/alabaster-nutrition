import { NextResponse, type NextRequest } from "next/server";
import { UserError } from "@/lib/server/errors";
import { forgetDevice, registerDevice } from "@/lib/server/push-devices";
import { getViewer, withMember } from "@/lib/server/session";

/** JSON only, so another site can't post here with the person's cookies without a preflight we don't allow. */
async function tokenFrom(request: NextRequest): Promise<unknown> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) return null;
  try {
    return ((await request.json()) as { token?: unknown }).token;
  } catch {
    return null;
  }
}

async function signedIn() {
  const viewer = await getViewer();
  return viewer?.kind === "manager" || viewer?.kind === "employee";
}

export async function POST(request: NextRequest) {
  if (!(await signedIn())) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const token = await tokenFrom(request);
  try {
    await withMember((db, member) => registerDevice(db, member.employeeId, token));
  } catch (error) {
    if (error instanceof UserError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  if (!(await signedIn())) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const token = await tokenFrom(request);
  await withMember((db, member) => forgetDevice(db, member.employeeId, token));
  return NextResponse.json({ ok: true });
}
