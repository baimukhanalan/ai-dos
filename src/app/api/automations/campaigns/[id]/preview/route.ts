import { previewCampaign } from "@/lib/dal/campaigns";
import { apiError } from "@/lib/errors";
import { campaignPreviewSchema } from "@/lib/validation/automation";

export async function POST(request: Request) {
  try {
    const input = campaignPreviewSchema.parse(await request.json());
    return Response.json({ ok: true, data: await previewCampaign(input) });
  } catch (error) {
    return apiError(error);
  }
}
