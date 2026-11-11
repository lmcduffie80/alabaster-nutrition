import "server-only";
import { sql } from "drizzle-orm";
import type { Db } from "@/db";

/** For the platform owner only: counts across every business, never any business's records themselves. */

export const ACTIVE_DAYS = 7;

export type BusinessUsage = {
  id: number;
  name: string;
  createdAt: Date;
  team: number;
  /** Active team members with an email, who can sign in on their phone. */
  withEmail: number;
  managers: number;
  kiosks: number;
  /** Clock-ins, clock-outs and breaks in the last `ACTIVE_DAYS` days. */
  recentPunches: number;
  lastPunchAt: Date | null;
};

export async function businessUsage(db: Db, now: Date): Promise<BusinessUsage[]> {
  const since = new Date(now.getTime() - ACTIVE_DAYS * 86_400_000);
  const result = await db.execute(sql`
    select b.id, b.name, b.created_at,
      (select count(*) from employee e where e.business_id = b.id and e.active)::int as team,
      (select count(*) from employee e where e.business_id = b.id and e.active and e.email is not null)::int as with_email,
      (select count(*) from employee e where e.business_id = b.id and e.active and e.role = 'manager')::int as managers,
      (select count(*) from kiosk_device k where k.business_id = b.id and k.revoked_at is null)::int as kiosks,
      (select count(*) from punch p where p.business_id = b.id and not p.voided and p.at >= ${since.toISOString()})::int as recent_punches,
      (select max(p.at) from punch p where p.business_id = b.id and not p.voided) as last_punch_at
    from business b
    order by b.created_at, b.id
  `);
  const rows = (result as unknown as { rows: Record<string, unknown>[] }).rows;
  return rows.map((row) => ({
    id: Number(row.id),
    name: String(row.name),
    createdAt: new Date(row.created_at as string),
    team: Number(row.team),
    withEmail: Number(row.with_email),
    managers: Number(row.managers),
    kiosks: Number(row.kiosks),
    recentPunches: Number(row.recent_punches),
    lastPunchAt: row.last_punch_at ? new Date(row.last_punch_at as string) : null,
  }));
}

export function usageTotals(usage: BusinessUsage[]) {
  return {
    businesses: usage.length,
    activeBusinesses: usage.filter((b) => b.recentPunches > 0).length,
    team: usage.reduce((sum, b) => sum + b.team, 0),
    withEmail: usage.reduce((sum, b) => sum + b.withEmail, 0),
    recentPunches: usage.reduce((sum, b) => sum + b.recentPunches, 0),
  };
}
