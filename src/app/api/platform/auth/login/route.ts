import { createHash } from "node:crypto";
import { authenticatePlatform } from "@/lib/dal/auth";
import { apiError } from "@/lib/errors";
import { createSession } from "@/lib/session";
import { loginSchema } from "@/lib/validation/auth";

function requestContext(request: Request) {
  const source =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  return {
    ipHash: createHash("sha256")
      .update(`${process.env.SESSION_SECRET || "ai-dos"}:${source}`)
      .digest("hex"),
    requestId: request.headers.get("x-vercel-id") || crypto.randomUUID(),
  };
}

export async function POST(request: Request) {
  try {
    const input = loginSchema.parse(await request.json());
    const admin = await authenticatePlatform(input, requestContext(request));
    await createSession({
      userId: admin.id,
      tenantId: admin.tenantId,
      role: admin.role,
      scope: "platform",
    });
    return Response.json({
      ok: true,
      data: { id: admin.id, fullName: admin.fullName, role: admin.role },
    });
  } catch (error) {
    return apiError(error);
  }
}
