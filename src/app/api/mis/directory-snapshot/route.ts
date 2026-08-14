import { authorizeMisWorker } from "@/lib/cron";
import { apiError, AppError } from "@/lib/errors";
import { ingestDamuMedDirectorySnapshot } from "@/lib/integrations/damumed-browser-directory";
import { damumedDirectorySnapshotSchema } from "@/lib/validation/damumed-browser";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    if (!process.env.MIS_WORKER_SECRET) throw new AppError("mis_worker_not_configured", 503, "Внешний воркер МИС не настроен.");
    if (!authorizeMisWorker(request)) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
    const input = damumedDirectorySnapshotSchema.parse(await request.json());
    if (!process.env.MIS_WORKER_TENANT_ID) throw new AppError("mis_worker_tenant_not_configured", 503, "Внешний воркер не привязан к клинике.");
    if (input.tenantId !== process.env.MIS_WORKER_TENANT_ID) throw new AppError("mis_worker_tenant_forbidden", 403, "Внешний воркер не имеет доступа к этой клинике.");
    const data = await ingestDamuMedDirectorySnapshot(input);
    return Response.json({ ok: true, data });
  } catch (error) {
    return apiError(error);
  }
}
