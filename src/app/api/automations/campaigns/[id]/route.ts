import { auditContextFromRequest } from "@/lib/audit-context";
import { saveCampaignDraft } from "@/lib/dal/campaigns";
import { apiError } from "@/lib/errors";
import { campaignDraftSchema } from "@/lib/validation/automation";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const input = campaignDraftSchema.parse(await request.json());
    return Response.json({ ok: true, data: await saveCampaignDraft(id, input, auditContextFromRequest(request)) });
  } catch (error) {
    return apiError(error);
  }
}
