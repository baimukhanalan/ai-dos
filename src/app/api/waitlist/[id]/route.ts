import { z } from "zod";
import { apiError } from "@/lib/errors";
import { respondToWaitlistOffer } from "@/lib/scheduling/waitlist";
import { waitlistActionSchema } from "@/lib/validation/billing";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = z
      .object({ id: z.string().uuid() })
      .parse(await context.params);
    const body = waitlistActionSchema.parse(await request.json());
    const item = await respondToWaitlistOffer(
      id,
      body.action,
      body.idempotencyKey,
    );
    return Response.json({ ok: true, item });
  } catch (error) {
    return apiError(error);
  }
}
