import { z } from "zod";
import { apiError } from "@/lib/errors";
import {
  cancelNotification,
  retryNotification,
} from "@/lib/dal/notifications";
import { notificationActionSchema } from "@/lib/validation/billing";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = z
      .object({ id: z.string().uuid() })
      .parse(await context.params);
    const { action } = notificationActionSchema.parse(await request.json());
    const item =
      action === "retry"
        ? await retryNotification(id)
        : await cancelNotification(id);
    return Response.json({ ok: true, item });
  } catch (error) {
    return apiError(error);
  }
}
