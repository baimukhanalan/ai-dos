import { authorizeMisWorker } from "@/lib/cron";
import { db } from "@/lib/db";
import { apiError, AppError } from "@/lib/errors";
import { claimSyncBatch, loadSyncPayload } from "@/lib/integrations/mis-sync";
import { misQueueQuerySchema } from "@/lib/validation/mis";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Очередь для внешнего воркера МИС. Он забирает пачку записей под аренду,
 * заводит их в чужой системе и отчитывается в `/api/mis/results`.
 *
 * Наружу уходит минимум: имя, телефон и дата рождения пациента — без ИИН,
 * жалоб и любых медицинских подробностей.
 */
export async function GET(request: Request) {
  try {
    if (!process.env.MIS_WORKER_SECRET) {
      throw new AppError(
        "mis_worker_not_configured",
        503,
        "Внешний воркер МИС не настроен: задайте MIS_WORKER_SECRET.",
      );
    }
    const workerTenantId = process.env.MIS_WORKER_TENANT_ID;
    if (!workerTenantId) throw new AppError("mis_worker_tenant_not_configured", 503, "Внешний воркер не привязан к клинике.");
    if (!authorizeMisWorker(request)) {
      return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
    if (process.env.MIS_ADAPTER !== "remote") {
      throw new AppError(
        "mis_mode_not_remote",
        409,
        "Очередь обслуживается внутри приложения. Установите MIS_ADAPTER=remote.",
      );
    }

    const { limit } = misQueueQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const sql = db();
    const claimed = await claimSyncBatch(sql, limit, workerTenantId);
    const payloads = await Promise.all(
      claimed.map((appointment) => loadSyncPayload(sql, appointment)),
    );

    return Response.json({
      ok: true,
      /** Пока аренда не истекла, эти записи никому больше не выдадут. */
      leaseMinutes: 10,
      items: payloads.filter(Boolean),
    });
  } catch (error) {
    return apiError(error);
  }
}
