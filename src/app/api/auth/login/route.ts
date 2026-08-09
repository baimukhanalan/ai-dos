import { authenticate } from "@/lib/dal/auth";
import { apiError } from "@/lib/errors";
import { createSession } from "@/lib/session";
import { loginSchema } from "@/lib/validation/auth";

export async function POST(request: Request) {
  try {
    const input = loginSchema.parse(await request.json());
    const user = await authenticate(input);
    await createSession({
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
    });

    return Response.json({
      ok: true,
      data: {
        user: {
          id: user.id,
          fullName: user.fullName,
          role: user.role,
        },
        tenant: { id: user.tenantId, name: user.tenantName },
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
