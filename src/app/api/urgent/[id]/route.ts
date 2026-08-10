import { z } from "zod";
import { resolveUrgentRequest } from "@/lib/dal/urgent";
import { apiError } from "@/lib/errors";
import { urgentDecisionSchema } from "@/lib/validation/booking";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({ id: z.string().uuid() });

/** Решение человека по срочному запросу: принять вне графика, предложить другое время или отказать. */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const params = paramsSchema.parse(await context.params);
    const decision = urgentDecisionSchema.parse(await request.json());
    const result = await resolveUrgentRequest(params.id, decision);
    return Response.json({ ok: true, data: result });
  } catch (error) {
    return apiError(error);
  }
}
