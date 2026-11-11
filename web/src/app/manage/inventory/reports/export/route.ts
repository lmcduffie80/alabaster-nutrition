import type { NextRequest } from "next/server";
import { localDateOf } from "@/lib/domain/time";
import { getBusiness } from "@/lib/server/business";
import { spendingCsv, spendingReport, stockCsv, usageCsv, usageReport } from "@/lib/server/inventory-reports";
import { withManagerOrNull } from "@/lib/server/session";

export async function GET(request: NextRequest) {
  const response = await withManagerOrNull(async (db): Promise<Response> => {
    const query = request.nextUrl.searchParams;
    const now = new Date();
    let body: string;
    let filename: string;
    switch (query.get("report")) {
      case "usage": {
        const report = await usageReport(db, query.get("period") ?? undefined);
        if (!report.period) return new Response("No usage yet", { status: 404 });
        body = usageCsv(report);
        filename = `alabaster-usage-${report.period.to}.csv`;
        break;
      }
      case "spending": {
        const by = query.get("by") === "month" ? "month" : "week";
        body = spendingCsv(await spendingReport(db, by, now), by);
        filename = `alabaster-spending-by-${by}.csv`;
        break;
      }
      case "stock": {
        body = await stockCsv(db);
        filename = `alabaster-stock-${localDateOf(now, (await getBusiness(db)).timeZone)}.csv`;
        break;
      }
      default:
        return new Response("Unknown report", { status: 400 });
    }
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
