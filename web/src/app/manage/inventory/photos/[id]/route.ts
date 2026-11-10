import { z } from "zod";
import { getDb } from "@/db";
import { getPhoto } from "@/lib/server/invoice-scan";
import { readPhoto } from "@/lib/server/photo-store";
import { requireManager } from "@/lib/server/session";

/** Invoice photos are private; only managers get them, through here. */
export async function GET(_request: Request, { params }: RouteContext<"/manage/inventory/photos/[id]">) {
  await requireManager();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return new Response("Not found", { status: 404 });
  const photo = await getPhoto(await getDb(), id);
  const blob = photo && (await readPhoto(photo.pathname));
  if (!blob) return new Response("Not found", { status: 404 });
  return new Response(blob.stream, {
    headers: { "Content-Type": blob.blob.contentType, "Cache-Control": "private, max-age=3600" },
  });
}
