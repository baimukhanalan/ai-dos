import { z } from "zod";
import { withdrawCampaignConsent } from "@/lib/dal/campaign-opt-out";
import { apiError } from "@/lib/errors";

const schema = z.object({ token: z.string().min(32).max(200) });

export async function POST(request: Request) {
  try {
    const { token } = schema.parse(await request.json());
    return Response.json({ ok: true, data: await withdrawCampaignConsent(token) });
  } catch (error) {
    return apiError(error);
  }
}
