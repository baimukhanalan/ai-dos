import { apiError } from "@/lib/errors";
import { changePlan } from "@/lib/dal/billing";
import { planChangeSchema } from "@/lib/validation/billing";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  try {
    const input = planChangeSchema.parse(await request.json());
    const subscription = await changePlan(input);
    return Response.json({ ok: true, subscription });
  } catch (error) {
    return apiError(error);
  }
}
