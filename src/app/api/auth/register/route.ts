import { apiError } from "@/lib/errors";
import { enforceRegistrationRateLimit, registerTenant } from "@/lib/dal/auth";
import { createSession } from "@/lib/session";
import { registerSchema } from "@/lib/validation/auth";

export async function POST(request: Request) {
  try {
    const input = registerSchema.parse(await request.json());
    const forwarded =
      request.headers.get("x-vercel-forwarded-for") ||
      request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip") ||
      "unknown";
    const source = forwarded.split(",")[0]?.trim() || "unknown";
    await enforceRegistrationRateLimit(source);
    const user = await registerTenant(input);
    await createSession({
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
    });

    return Response.json(
      {
        ok: true,
        data: {
          user: {
            id: user.id,
            fullName: user.fullName,
            role: user.role,
          },
          tenant: {
            id: user.tenantId,
            name: user.tenantName,
            slug: user.tenantSlug,
          },
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
