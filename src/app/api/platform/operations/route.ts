import { auditContextFromRequest } from "@/lib/audit-context";
import { applyPlatformOperation } from "@/lib/dal/platform";
import { apiError } from "@/lib/errors";
import { platformOperationSchema } from "@/lib/validation/platform-operations";

export async function PATCH(request: Request) {
  try {
    const input = platformOperationSchema.parse(await request.json());
    const data = await applyPlatformOperation(input, auditContextFromRequest(request));
    return Response.json({ ok: true, data });
  } catch (error) {
    return apiError(error);
  }
}
