import { NextRequest } from "next/server";

import { createReportCsv, createReportXlsx, parseReportFilters } from "@/lib/analytics/reporting";
import { getAdvancedReport } from "@/lib/dal/reporting";
import { apiError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const source = Object.fromEntries(request.nextUrl.searchParams.entries());
    const format = source.format === "xlsx" ? "xlsx" : "csv";
    const filters = parseReportFilters(source);
    const report = await getAdvancedReport(filters);
    const rows = report.daily.map((row) => ({
      "Дата": row.day, "Звонки": row.calls, "Отвечено": row.answered,
      "Создано записей": row.appointments, "Завершено визитов": row.completed, "Неявки": row.noShows,
    }));
    const stamp = `${filters.from}_${filters.to}`;
    if (format === "xlsx") {
      const bytes = Uint8Array.from(createReportXlsx(rows));
      return new Response(bytes.buffer, { headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="ai-dos-report-${stamp}.xlsx"`, "Cache-Control": "private, no-store",
      } });
    }
    return new Response(createReportCsv(rows), { headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ai-dos-report-${stamp}.csv"`, "Cache-Control": "private, no-store",
    } });
  } catch (error) {
    return apiError(error);
  }
}
