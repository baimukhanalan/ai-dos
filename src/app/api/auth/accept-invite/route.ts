import { acceptStaffInvitation } from "@/lib/dal/staff";
import { apiError } from "@/lib/errors";
import { createSession } from "@/lib/session";
import { acceptStaffInvitationSchema } from "@/lib/validation/staff";

export async function POST(request: Request) {
  try {
    const input = acceptStaffInvitationSchema.parse(await request.json());
    const user = await acceptStaffInvitation(input);
    await createSession({
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
    });
    return Response.json({ ok: true, data: { role: user.role } });
  } catch (error) {
    return apiError(error);
  }
}
