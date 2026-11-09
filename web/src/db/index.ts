import "server-only";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
export { schema };

declare global {
  var alabasterDb: Promise<Db> | undefined;
}

async function connect(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const [{ Pool }, { drizzle }, { attachDatabasePool }] = await Promise.all([
      import("pg"),
      import("drizzle-orm/node-postgres"),
      import("@vercel/functions"),
    ]);
    const pool = new Pool({ connectionString: url, max: 5 });
    attachDatabasePool(pool);
    return drizzle({ client: pool, schema }) as unknown as Db;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("DATABASE_URL is not set.");
  }
  const { openLocalDatabase } = await import("./local");
  return openLocalDatabase(".data/pglite");
}

/** One connection pool per server instance; survives dev hot reloads. */
export function getDb(): Promise<Db> {
  globalThis.alabasterDb ??= connect();
  return globalThis.alabasterDb;
}
