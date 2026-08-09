import { authorizeMisWorker } from "@/lib/cron";
import { db } from "@/lib/db";
import { apiError, AppError } from "@/lib/errors";
import {
  applySyncResult,
  type ClaimedAppointment,
} from "@/lib/integrations/mis-sync";
import { misResultsSchema } from "@/lib/validation/mis";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Отчёт внешнего воркера. Применяется только к записям, которые сейчас
 * находятся под арендой (`syncing`), поэтому повторная отправка того же
 * отчёта ничего не меняет, а просроченная аренда не перетирает более свежую
 * попытку.
 */
export async function POST(request: Request) {
  try {
    if (!process.env.MIS_WORKER_SECRET) {
      throw new AppError(
        "mis_worker_not_configured",
        503,
        "Внешний воркер МИС не настроен: задайте MIS_WORKER_SECRET.",
      );
    }
    if (!authorizeMisWorker(request)) {
      return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const { results } = misResultsSchema.parse(await request.json());
    const sql = db();
    const provider = "damumed";
    const applied: Array<{ appointmentId: string; state: string }> = [];
    const ignored: string[] = [];

    for (const item of results) {
      const rows = (await sql`
        SELECT id, tenant_id, external_sync_attempts
        FROM appointments
        WHERE id = ${item.appointmentId} AND external_sync_state = 'syncing'
        LIMIT 1
      `) as ClaimedAppointment[];

      const appointment = rows[0];
      if (!appointment) {
        ignored.push(item.appointmentId);
        continue;
      }

      const decision = await applySyncResult(
        sql,
        appointment,
        item.result,
        provider,
        item.durationMs ?? 0,
      );
      applied.push({ appointmentId: appointment.id, state: decision.state });
    }

    return Response.json({ ok: true, applied, ignored });
  } catch (error) {
    return apiError(error);
  }
}
