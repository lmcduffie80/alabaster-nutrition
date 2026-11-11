import "server-only";
import { get, put, setTtl } from "@vercel/blob";

/** Invoice photos live in the private Blob store; unsaved scans expire on their own after a day. */
export async function storePhoto(businessId: number, bytes: Uint8Array) {
  const blob = await put(`invoices/${businessId}/${crypto.randomUUID()}.jpg`, Buffer.from(bytes), {
    access: "private",
    contentType: "image/jpeg",
    ttlDays: 1,
  });
  return blob.pathname;
}

export async function keepPhotos(pathnames: string[]) {
  if (pathnames.length) await setTtl(pathnames, { ttlDays: null });
}

export async function readPhoto(pathname: string) {
  const result = await get(pathname, { access: "private" });
  return result?.statusCode === 200 ? result : null;
}
