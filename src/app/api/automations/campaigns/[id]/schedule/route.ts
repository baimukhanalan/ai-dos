import { auditContextFromRequest } from "@/lib/audit-context";
import { scheduleCampaign } from "@/lib/dal/campaigns";
import { apiError } from "@/lib/errors";
import { campaignScheduleSchema } from "@/lib/validation/automation";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const input = campaignScheduleSchema.parse(await request.json());
    return Response.json({ ok: true, data: await scheduleCampaign(id, input, auditContextFromRequest(request)) });
  } catch (error) {
    return apiError(error);
  }
}
