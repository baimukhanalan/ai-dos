import { z } from "zod";
import { apiError } from "@/lib/errors";
import { updateEscalation } from "@/lib/dal/escalations";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  status: z.enum(["claimed", "resolved", "dismissed"]),
  note: z.string().trim().max(1000).optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = z.object({ id: z.string().uuid() }).parse(await context.params);
    const body = bodySchema.parse(await request.json());
    const item = await updateEscalation(id, body.status, body.note);
    return Response.json({ ok: true, item });
  } catch (error) {
    return apiError(error);
  }
}
