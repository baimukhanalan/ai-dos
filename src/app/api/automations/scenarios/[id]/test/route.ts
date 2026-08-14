import { testScenarioVersion } from "@/lib/dal/scenarios";
import { apiError } from "@/lib/errors";
import { scenarioTestSchema } from "@/lib/validation/automation";
import { z } from "zod";
import { auditContextFromRequest } from "@/lib/audit-context";

const paramsSchema = z.object({ id: z.string().uuid() });

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = paramsSchema.parse(await context.params);
    const input = scenarioTestSchema.parse(await request.json());
    const data = await testScenarioVersion(id, input, auditContextFromRequest(request));
    return Response.json({ ok: true, data });
  } catch (error) {
    return apiError(error);
  }
}
