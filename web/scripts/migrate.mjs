// Applies drizzle/ migrations during production builds only: preview deployments
// share the production database, so an unmerged branch must never change its schema.
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

if (process.env.VERCEL_ENV !== "production") {
  console.log("Skipping database migrations outside production.");
  process.exit(0);
}

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set.");

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await migrate(drizzle({ client }), { migrationsFolder: "drizzle" });
  console.log("Database migrations applied.");
} finally {
  await client.end();
}
