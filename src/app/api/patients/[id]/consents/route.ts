import { auditContextFromRequest } from "@/lib/audit-context";
import { recordPatientConsent } from "@/lib/dal/patient-360";
import { apiError } from "@/lib/errors";
import { consentSchema } from "@/lib/validation/patient-360";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const input = consentSchema.parse(await request.json());
    const audit = auditContextFromRequest(request);
    const data = await recordPatientConsent(id, input, audit.ipHash);
    return Response.json({ ok: true, data }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
