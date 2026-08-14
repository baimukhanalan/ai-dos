import { createHash } from "node:crypto";
import { updatePlatformTenantStatus } from "@/lib/dal/platform";
import { apiError } from "@/lib/errors";
import { platformTenantStatusSchema } from "@/lib/validation/platform";
import { z } from "zod";

const paramsSchema = z.object({ id: z.string().uuid() });

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = paramsSchema.parse(await context.params);
    const input = platformTenantStatusSchema.parse(await request.json());
    const source =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";
    const data = await updatePlatformTenantStatus(id, input, {
      ipHash: createHash("sha256")
        .update(`${process.env.SESSION_SECRET || "ai-dos"}:${source}`)
        .digest("hex"),
      requestId: request.headers.get("x-vercel-id") || crypto.randomUUID(),
    });
    return Response.json({ ok: true, data });
  } catch (error) {
    return apiError(error);
  }
}
