import { apiError } from "@/lib/errors";
import { updateBranding } from "@/lib/dal/billing";
import { brandingSchema } from "@/lib/validation/billing";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  try {
    const input = brandingSchema.parse(await request.json());
    const branding = await updateBranding(input);
    return Response.json({ ok: true, branding });
  } catch (error) {
    return apiError(error);
  }
}
