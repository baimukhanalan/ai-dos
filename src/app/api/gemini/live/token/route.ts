import { randomUUID } from "node:crypto";
import {
  ActivityHandling,
  EndSensitivity,
  GoogleGenAI,
  Modality,
  StartSensitivity,
} from "@google/genai";
import { db } from "@/lib/db";
import {
  formatClinicAiContext,
  loadClinicAiContext,
} from "@/lib/ai/clinic-context";
import { requireUser } from "@/lib/dal/auth";
import { apiError, AppError } from "@/lib/errors";
import {
  geminiLiveModel,
  buildReceptionistInstructions,
} from "@/lib/voice/config";
import { geminiLiveSessionSchema } from "@/lib/validation/voice";

export const runtime = "nodejs";

function providerMessage(status?: number) {
  if (status === 400) return "Gemini отклонил параметры голосовой сессии.";
  if (status === 401 || status === 403) {
    return "Gemini отклонил ключ проекта. Замените GEMINI_API_KEY.";
  }
  if (status === 429) {
    return "Gemini временно ограничил голосовые подключения. Повторите через минуту.";
  }
  return "Gemini Live временно недоступен. Повторите тест.";
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = geminiLiveSessionSchema.parse(await request.json());
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new AppError(
        "gemini_not_configured",
        503,
        "Gemini Live ещё не настроен для голосового теста.",
      );
    }

    const sql = db();
    const [recentRows, clinicContext] = await Promise.all([
      sql`
        SELECT count(*)::int AS count
        FROM voice_sessions
        WHERE tenant_id = ${user.tenantId}
          AND user_id = ${user.id}
          AND started_at > now() - interval '1 hour'
      `,
      loadClinicAiContext(user.tenantId),
    ]);
    const recent = recentRows as Array<{ count: number }>;
    if ((recent[0]?.count || 0) >= 20) {
      throw new AppError(
        "voice_rate_limited",
        429,
        "Лимит тестовых сессий на этот час исчерпан.",
      );
    }

    const systemInstruction = buildReceptionistInstructions({
      clinicName: user.tenantName,
      language: input.language,
      clinicContext: formatClinicAiContext(clinicContext),
    });
    const liveConfig = {
      responseModalities: [Modality.AUDIO],
      temperature: 0.6,
      systemInstruction,
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: input.voice } },
      },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      realtimeInputConfig: {
        automaticActivityDetection: {
          disabled: false,
          startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_HIGH,
          endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_HIGH,
          prefixPaddingMs: 20,
          silenceDurationMs: 320,
        },
        activityHandling: ActivityHandling.START_OF_ACTIVITY_INTERRUPTS,
      },
      contextWindowCompression: { slidingWindow: {} },
    };

    const client = new GoogleGenAI({
      apiKey,
      httpOptions: { apiVersion: "v1alpha" },
    });
    let tokenName: string | undefined;
    try {
      const token = await client.authTokens.create({
        config: {
          uses: 1,
          newSessionExpireTime: new Date(Date.now() + 60_000).toISOString(),
          expireTime: new Date(Date.now() + 30 * 60_000).toISOString(),
          liveConnectConstraints: {
            model: geminiLiveModel,
            config: liveConfig,
          },
          lockAdditionalFields: [],
          httpOptions: { apiVersion: "v1alpha" },
        },
      });
      tokenName = token.name;
    } catch (error) {
      const status =
        typeof error === "object" && error !== null && "status" in error
          ? Number(error.status)
          : undefined;
      await sql`
        INSERT INTO audit_events (tenant_id, actor_user_id, action, resource_type, metadata)
        VALUES (${user.tenantId}, ${user.id}, 'voice.gemini.failed', 'voice_session',
          ${JSON.stringify({ providerStatus: status || null })}::jsonb)
      `;
      throw new AppError(
        "gemini_live_unavailable",
        status === 400 || status === 401 || status === 403 || status === 429
          ? status
          : 503,
        providerMessage(status),
      );
    }

    if (!tokenName) {
      throw new AppError(
        "invalid_gemini_token",
        502,
        "Gemini вернул неполный ответ авторизации.",
      );
    }

    const sessionId = randomUUID();
    const conversationId = randomUUID();
    await sql.transaction([
      sql`
        INSERT INTO conversations (id, tenant_id, channel, language, subject)
        VALUES (
          ${conversationId}, ${user.tenantId}, 'phone',
          ${input.language === "auto" ? "ru" : input.language},
          'Голосовой разговор AI Dos'
        )
      `,
      sql`
        INSERT INTO voice_sessions (
          id, tenant_id, user_id, model, voice, requested_language, status,
          conversation_id
        ) VALUES (
          ${sessionId}, ${user.tenantId}, ${user.id}, ${geminiLiveModel},
          ${input.voice}, ${input.language}, 'created', ${conversationId}
        )
      `,
      sql`
        INSERT INTO audit_events (
          tenant_id, actor_user_id, action, resource_type, resource_id, metadata
        ) VALUES (
          ${user.tenantId}, ${user.id}, 'voice.session.created',
          'voice_session', ${sessionId},
          ${JSON.stringify({ model: geminiLiveModel, voice: input.voice, provider: "gemini", transport: "websocket" })}::jsonb
        )
      `,
    ]);

    return Response.json(
      {
        sessionId,
        clientToken: tokenName,
        model: geminiLiveModel,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
