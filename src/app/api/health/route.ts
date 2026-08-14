import { db, isDatabaseConfigured } from "@/lib/db";
import { misIntegrationStatus } from "@/lib/integrations/mis-status";

export const dynamic = "force-dynamic";

export async function GET() {
  const databaseConfigured = isDatabaseConfigured();
  let database: "connected" | "unavailable" | "not_configured" =
    databaseConfigured ? "unavailable" : "not_configured";

  if (databaseConfigured) {
    try {
      await db()`SELECT 1 AS ok`;
      database = "connected";
    } catch {
      database = "unavailable";
    }
  }

  return Response.json(
    {
      ok: database === "connected",
      service: "ai-dos",
      database,
      ai:
        process.env.AI_RUNTIME === "openai"
          ? process.env.OPENAI_API_KEY
            ? "openai_configured"
            : "not_configured"
          : "safe_mode",
      realtimeVoice: process.env.GEMINI_API_KEY
        ? "gemini_live_ready"
        : "not_configured",
      telephony:
        process.env.OPENAI_API_KEY &&
        process.env.OPENAI_WEBHOOK_SECRET &&
        process.env.OPENAI_PROJECT_ID
          ? "sip_ready"
          : "provider_setup_required",
      damumed: misIntegrationStatus(),
      timestamp: new Date().toISOString(),
    },
    {
      status: database === "connected" ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
