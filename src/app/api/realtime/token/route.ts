import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/dal/auth";
import { apiError, AppError } from "@/lib/errors";
import { voiceSessionSchema } from "@/lib/validation/voice";
import { publicAppUrl, realtimeSessionConfig } from "@/lib/voice/config";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = voiceSessionSchema.parse(await request.json());
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new AppError(
        "openai_not_configured",
        503,
        "OpenAI API ещё не настроен для голосового теста.",
      );
    }

    const sql = db();
    const recent = (await sql`
      SELECT count(*)::int AS count
      FROM voice_sessions
      WHERE tenant_id = ${user.tenantId}
        AND user_id = ${user.id}
        AND started_at > now() - interval '1 hour'
    `) as Array<{ count: number }>;
    if ((recent[0]?.count || 0) >= 20) {
      throw new AppError(
        "voice_rate_limited",
        429,
        "Лимит тестовых сессий на этот час исчерпан.",
      );
    }

    const baseUrl = publicAppUrl(new URL(request.url).origin);
    const mcpUrl = baseUrl.startsWith("https://")
      ? `${baseUrl}/api/mcp`
      : undefined;
    const session = realtimeSessionConfig({
      clinicName: user.tenantName,
      language: input.language,
      voice: input.voice,
      model: input.model,
      speed: input.speed,
      mcpUrl,
    });
    const safetyIdentifier = createHash("sha256")
      .update(`${user.tenantId}:${user.id}`)
      .digest("hex");
    const response = await fetch(
      "https://api.openai.com/v1/realtime/client_secrets",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "OpenAI-Safety-Identifier": safetyIdentifier,
        },
        body: JSON.stringify({ session }),
        signal: AbortSignal.timeout(15_000),
      },
    );

    if (!response.ok) {
      const code =
        response.status === 429
          ? "openai_quota_unavailable"
          : "openai_realtime_unavailable";
      await sql`
        INSERT INTO audit_events (tenant_id, actor_user_id, action, resource_type, metadata)
        VALUES (${user.tenantId}, ${user.id}, 'voice.session.failed', 'voice_session',
          ${JSON.stringify({ code, providerStatus: response.status })}::jsonb)
      `;
      throw new AppError(
        code,
        response.status === 429 ? 429 : 503,
        response.status === 429
          ? "На OpenAI API нет доступной квоты. Пополните баланс проекта и повторите тест."
          : "Голосовой провайдер временно недоступен.",
      );
    }

    const secret = (await response.json()) as {
      value?: string;
      expires_at?: number;
    };
    if (!secret.value) {
      throw new AppError(
        "invalid_realtime_secret",
        502,
        "Голосовой провайдер вернул неполный ответ.",
      );
    }

    const sessionId = randomUUID();
    await sql.transaction([
      sql`
        INSERT INTO voice_sessions (
          id, tenant_id, user_id, model, voice, requested_language, status
        ) VALUES (
          ${sessionId}, ${user.tenantId}, ${user.id}, ${input.model},
          ${input.voice}, ${input.language}, 'created'
        )
      `,
      sql`
        INSERT INTO audit_events (
          tenant_id, actor_user_id, action, resource_type, resource_id,
          metadata
        ) VALUES (
          ${user.tenantId}, ${user.id}, 'voice.session.created',
          'voice_session', ${sessionId},
          ${JSON.stringify({ model: input.model, voice: input.voice })}::jsonb
        )
      `,
    ]);

    return NextResponse.json({
      sessionId,
      clientSecret: secret.value,
      expiresAt: secret.expires_at ?? null,
      model: input.model,
    });
  } catch (error) {
    return apiError(error);
  }
}
