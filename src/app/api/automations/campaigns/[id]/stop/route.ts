import { auditContextFromRequest } from "@/lib/audit-context";
import { stopCampaign } from "@/lib/dal/campaigns";
import { apiError } from "@/lib/errors";
import { campaignStopSchema } from "@/lib/validation/automation";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    campaignStopSchema.parse(await request.json());
    return Response.json({ ok: true, data: await stopCampaign(id, auditContextFromRequest(request)) });
  } catch (error) {
    return apiError(error);
  }
}
