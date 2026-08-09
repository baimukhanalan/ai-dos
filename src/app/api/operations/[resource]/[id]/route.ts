import { z } from "zod";
import { db } from "@/lib/db";
import { requireRoles } from "@/lib/dal/auth";
import { apiError, AppError } from "@/lib/errors";

const paramsSchema = z.object({
  resource: z.enum(["callbacks", "tasks", "urgent"]),
  id: z.string().uuid(),
});

const statusSchemas = {
  callbacks: z.enum(["new", "in_progress", "done", "cancelled"]),
  tasks: z.enum(["open", "in_progress", "done", "cancelled"]),
  urgent: z.enum([
    "pending",
    "approved",
    "declined",
    "alternative_offered",
    "closed",
  ]),
};

export async function PATCH(
  request: Request,
  context: { params: Promise<{ resource: string; id: string }> },
) {
  try {
    const user = await requireRoles(["clinic_admin", "operator", "doctor"]);
    const params = paramsSchema.parse(await context.params);
    const body = (await request.json()) as { status?: unknown };
    const status = statusSchemas[params.resource].parse(body.status);
    const sql = db();
    let rows: Record<string, unknown>[];

    if (params.resource === "callbacks") {
      rows = await sql`
        UPDATE callback_requests
        SET status = ${status}, assigned_user_id = COALESCE(assigned_user_id, ${user.id})
        WHERE id = ${params.id} AND tenant_id = ${user.tenantId}
        RETURNING id, status
      `;
    } else if (params.resource === "tasks") {
      rows = await sql`
        UPDATE staff_tasks
        SET status = ${status}, assigned_user_id = COALESCE(assigned_user_id, ${user.id}),
          updated_at = now()
        WHERE id = ${params.id} AND tenant_id = ${user.tenantId}
        RETURNING id, status
      `;
    } else {
      rows = await sql`
        UPDATE urgent_requests
        SET status = ${status}, resolved_by = ${user.id},
          resolved_at = CASE WHEN ${status} = 'pending' THEN null ELSE now() END
        WHERE id = ${params.id} AND tenant_id = ${user.tenantId}
        RETURNING id, status
      `;
    }
    if (!rows[0]) {
      throw new AppError("operation_not_found", 404, "Запись не найдена.");
    }
    await sql`
      INSERT INTO audit_events (
        tenant_id, actor_user_id, action, resource_type, resource_id, metadata
      ) VALUES (
        ${user.tenantId}, ${user.id}, 'operation.status.changed', ${params.resource},
        ${params.id}, ${JSON.stringify({ status })}::jsonb
      )
    `;
    return Response.json({ ok: true, item: rows[0] });
  } catch (error) {
    return apiError(error);
  }
}
