import { saveScenarioDraft } from "@/lib/dal/scenarios";
import { apiError } from "@/lib/errors";
import { scenarioSaveSchema } from "@/lib/validation/automation";
import { z } from "zod";
import { auditContextFromRequest } from "@/lib/audit-context";

const paramsSchema = z.object({ id: z.string().uuid() });

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = paramsSchema.parse(await context.params);
    const input = scenarioSaveSchema.parse(await request.json());
    const data = await saveScenarioDraft(id, input, auditContextFromRequest(request));
    return Response.json({ ok: true, data });
  } catch (error) {
    return apiError(error);
  }
}
