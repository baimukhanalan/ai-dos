import { createStaffInvitation } from "@/lib/dal/staff";
import { apiError } from "@/lib/errors";
import { staffInvitationSchema } from "@/lib/validation/staff";

export async function POST(request: Request) {
  try {
    const input = staffInvitationSchema.parse(await request.json());
    const origin = new URL(request.url).origin;
    const data = await createStaffInvitation(input, origin);
    return Response.json({ ok: true, data }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
