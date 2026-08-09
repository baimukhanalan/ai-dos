import { createHash, randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/dal/auth";
import { apiError, AppError } from "@/lib/errors";
import { voiceSessionSchema } from "@/lib/validation/voice";
import { publicAppUrl, realtimeSessionConfig } from "@/lib/voice/config";

export const runtime = "nodejs";

function providerMessage(status: number, code?: string) {
  if (status === 401) return "OpenAI отклонил ключ проекта. Замените OPENAI_API_KEY.";
  if (status === 403) return "У проекта OpenAI нет доступа к выбранной Realtime-модели.";
  if (status === 429 && code === "insufficient_quota") {
    return "На OpenAI API закончился баланс или достигнут лимит расходов.";
  }
  if (status === 429) return "OpenAI ограничил частоту Realtime-подключений. Повторите через минуту.";
  return "OpenAI не принял WebRTC-соединение. Повторите тест или выберите другую модель.";
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const url = new URL(request.url);
    const input = voiceSessionSchema.parse({
      model: url.searchParams.get("model") || undefined,
      voice: url.searchParams.get("voice") || undefined,
      language: url.searchParams.get("language") || undefined,
      speed: Number(url.searchParams.get("speed") || 1),
      recordingConsent: url.searchParams.get("recordingConsent") === "true",
    });
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new AppError("openai_not_configured", 503, "OpenAI API ещё не настроен для голосового теста.");
    }

    const sdp = await request.text();
    if (
      request.headers.get("content-type")?.split(";")[0] !== "application/sdp" ||
      sdp.length < 100 ||
      sdp.length > 100_000 ||
      !sdp.startsWith("v=0") ||
      !sdp.includes("m=audio")
    ) {
      throw new AppError("invalid_sdp", 400, "Браузер не сформировал корректное аудиосоединение.");
    }

    const sql = db();
    const recent = (await sql`
      SELECT count(*)::int AS count
      FROM voice_sessions
      WHERE tenant_id = ${user.tenantId} AND user_id = ${user.id}
        AND started_at > now() - interval '1 hour'
    `) as Array<{ count: number }>;
    if ((recent[0]?.count || 0) >= 20) {
      throw new AppError("voice_rate_limited", 429, "Лимит тестовых сессий на этот час исчерпан.");
    }

    const baseUrl = publicAppUrl(new URL(request.url).origin);
    const session = realtimeSessionConfig({
      clinicName: user.tenantName,
      language: input.language,
      voice: input.voice,
      model: input.model,
      speed: input.speed,
      mcpUrl: baseUrl.startsWith("https://") ? `${baseUrl}/api/mcp` : undefined,
    });
    const form = new FormData();
    form.set("sdp", sdp);
    form.set("session", JSON.stringify(session));
    const safetyIdentifier = createHash("sha256")
      .update(`${user.tenantId}:${user.id}`)
      .digest("hex");
    const provider = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "OpenAI-Safety-Identifier": safetyIdentifier,
      },
      body: form,
      signal: AbortSignal.timeout(20_000),
    });

    if (!provider.ok) {
      const raw = await provider.text();
      let code: string | undefined;
      try {
        const payload = JSON.parse(raw) as { error?: { code?: string } };
        code = payload.error?.code;
      } catch {
        code = undefined;
      }
      await sql`
        INSERT INTO audit_events (tenant_id, actor_user_id, action, resource_type, metadata)
        VALUES (${user.tenantId}, ${user.id}, 'voice.webrtc.failed', 'voice_session',
          ${JSON.stringify({ providerStatus: provider.status, providerCode: code || null })}::jsonb)
      `;
      throw new AppError(
        code || "openai_webrtc_unavailable",
        provider.status === 401 || provider.status === 403 || provider.status === 429
          ? provider.status
          : 503,
        providerMessage(provider.status, code),
      );
    }

    const answer = await provider.text();
    if (!answer.startsWith("v=0") || !answer.includes("m=audio")) {
      throw new AppError("invalid_provider_sdp", 502, "OpenAI вернул некорректный ответ WebRTC.");
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
          tenant_id, actor_user_id, action, resource_type, resource_id, metadata
        ) VALUES (
          ${user.tenantId}, ${user.id}, 'voice.session.created',
          'voice_session', ${sessionId},
          ${JSON.stringify({ model: input.model, voice: input.voice, transport: "webrtc_unified" })}::jsonb
        )
      `,
    ]);

    return new Response(answer, {
      status: 200,
      headers: {
        "Content-Type": "application/sdp",
        "Cache-Control": "no-store",
        "X-AI-Dos-Session-Id": sessionId,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
