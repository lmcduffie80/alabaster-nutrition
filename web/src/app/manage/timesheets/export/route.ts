import type { NextRequest } from "next/server";
import { timesheetCsv, timesheetTotalsCsv } from "@/lib/domain/timesheet";
import { withManagerOrNull } from "@/lib/server/session";
import { periodTimesheets } from "@/lib/server/timesheets";

export async function GET(request: NextRequest) {
  const response = await withManagerOrNull(async (db): Promise<Response> => {
    const query = request.nextUrl.searchParams;
    const sheet = await periodTimesheets(db, new Date(), query.get("period") ?? undefined);
    const names = new Map(sheet.rows.map((r) => [r.employee.id, r.employee.displayName]));
    const rows = sheet.rows.map((r) => r.row);
    const totals = query.get("type") !== "detail";
    const body = totals
      ? timesheetTotalsCsv(rows, names, new Set(sheet.rows.filter((r) => r.approval).map((r) => r.employee.id)))
      : timesheetCsv(rows, names, sheet.timeZone);
    const filename = `alabaster-${totals ? "hours" : "shifts"}-${sheet.period.start}.csv`;
    return new Response(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  });
  return response ?? new Response("Not allowed", { status: 403 });
}
