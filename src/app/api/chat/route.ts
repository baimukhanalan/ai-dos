import { randomUUID } from "node:crypto";
import { openai } from "@ai-sdk/openai";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  type UIMessage,
} from "ai";
import { safeAssistantReply } from "@/lib/ai/safe-assistant";
import { classifyEscalation, detectIntent } from "@/lib/ai/escalation";
import { recordEscalation } from "@/lib/dal/escalations";
import {
  formatClinicAiContext,
  loadClinicAiContext,
  type ClinicAiContext,
} from "@/lib/ai/clinic-context";
import { recordUsage } from "@/lib/billing/usage";
import { requireUser } from "@/lib/dal/auth";
import { db } from "@/lib/db";
import { apiError, AppError } from "@/lib/errors";
import { chatRequestSchema } from "@/lib/validation/operations";

export const maxDuration = 45;

const SYSTEM_PROMPT = `Ты — AI Dos, операционный помощник регистратуры клиники в Казахстане.

Твоя задача: помогать сотруднику вежливо и кратко формулировать ответы пациенту, уточнять запрос, подбирать следующий операционный шаг и своевременно передавать разговор человеку.

Обязательные правила:
- Никогда не ставь диагноз, не назначай лечение и не интерпретируй анализы.
- При признаках угрозы жизни, сильной боли, потере сознания, затруднённом дыхании или иных срочных симптомах немедленно рекомендуй обратиться в экстренную службу 112/103 и передай диалог сотруднику.
- Не запрашивай ИИН, документы или медицинские подробности, если они не нужны для записи.
- Не утверждай, что запись создана, пока система явно не вернула подтверждение.
- Если DAMUMED упомянут, честно говори, что официальная интеграция ожидает API клиники.
- Отвечай на языке последнего сообщения: русский, қазақша или English.
- Пиши как заботливый сотрудник регистратуры: спокойно, конкретно, без медицинских обещаний.
- В конце, если уместно, дай один ясный следующий шаг.`;

const MAX_CHAT_BODY_BYTES = 100_000;

async function readLimitedBody(request: Request) {
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > MAX_CHAT_BODY_BYTES) {
    throw new AppError(
      "chat_payload_too_large",
      413,
      "Диалог слишком большой. Начните новый запрос.",
    );
  }

  if (!request.body) return "";
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let raw = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_CHAT_BODY_BYTES) {
      await reader.cancel();
      throw new AppError(
        "chat_payload_too_large",
        413,
        "Диалог слишком большой. Начните новый запрос.",
      );
    }
    raw += decoder.decode(value, { stream: true });
  }

  return raw + decoder.decode();
}

function messageText(message: UIMessage | undefined) {
  if (!message) return "";
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

const intentLabels: Record<string, string> = {
  book: "Запись на приём",
  reschedule: "Перенос записи",
  cancel: "Отмена записи",
  results: "Запрос результатов",
  complaint: "Жалоба",
  human: "Просьба соединить с человеком",
  urgent: "Срочное обращение",
  other: "Обращение",
};

/**
 * Если разговор требует человека — создаём готовую карточку эскалации:
 * сводка последних реплик, распознанный intent и причина, а также уже
 * предпринятое действие (что ответил ассистент). Best-effort: не влияет на
 * ответ пациенту.
 */
async function maybeEscalate(
  uiMessages: UIMessage[],
  tenantId: string,
  conversationId?: string,
) {
  const lastPatient = messageText(uiMessages.at(-1));
  if (!lastPatient) return;
  const decision = classifyEscalation(lastPatient);
  if (!decision.shouldEscalate) return;

  const recent = uiMessages
    .slice(-4)
    .map((m) => `${m.role === "user" ? "Пациент" : "AI"}: ${messageText(m)}`)
    .filter((line) => line.length > 4)
    .join("\n");

  await recordEscalation(tenantId, {
    conversationId: conversationId ?? null,
    channel: "web",
    intent: decision.intent,
    reason: decision.reason,
    priority: decision.priority,
    summary: `${intentLabels[decision.intent] || "Обращение"}. ${recent}`.slice(0, 900),
    attemptedActions: [
      { action: "ai_reply", result: "Ассистент ответил и передал разговор человеку" },
    ],
    dedupeKey: conversationId ? `chat:${conversationId}` : null,
  });
}

function safeModeResponse({
  input,
  uiMessages,
  sql,
  tenantId,
  clinicContext,
}: {
  input: { conversationId?: string };
  uiMessages: UIMessage[];
  sql: ReturnType<typeof db>;
  tenantId: string;
  clinicContext: ClinicAiContext;
}) {
  const reply = safeAssistantReply(
    messageText(uiMessages.at(-1)),
    clinicContext,
  );
  const textId = randomUUID();
  const messageId = randomUUID();
  const stream = createUIMessageStream({
    originalMessages: uiMessages,
    execute: async ({ writer }) => {
      writer.write({ type: "start", messageId });
      writer.write({ type: "start-step" });
      writer.write({ type: "text-start", id: textId });
      for (const part of reply.match(/.{1,90}(?:\s|$)/gu) || [reply]) {
        writer.write({ type: "text-delta", id: textId, delta: part });
      }
      writer.write({ type: "text-end", id: textId });
      writer.write({ type: "finish-step" });
      writer.write({ type: "finish", finishReason: "stop" });

      if (input.conversationId) {
        await sql`
          INSERT INTO messages (
            tenant_id, conversation_id, sender_type, content, model, surface
          ) VALUES (
            ${tenantId}, ${input.conversationId}, 'assistant', ${reply},
            'ai-dos-safe-mode', 'operator_assistant'
          )
        `;
      }
      await recordUsage(sql, tenantId, "ai_messages");
      await maybeEscalate(uiMessages, tenantId, input.conversationId);
    },
  });

  return createUIMessageStreamResponse({
    stream,
    headers: {
      "Cache-Control": "no-store",
      "X-AI-Dos-Runtime": "safe-mode",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const raw = await readLimitedBody(request);
    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      throw new AppError("invalid_json", 400, "Некорректный формат запроса.");
    }
    const input = chatRequestSchema.parse(payload);
    const uiMessages = input.messages as unknown as UIMessage[];
    const sql = db();
    const clinicContextPromise = loadClinicAiContext(user.tenantId);

    if (input.conversationId) {
      const allowed = await sql`
        SELECT id FROM conversations
        WHERE id = ${input.conversationId} AND tenant_id = ${user.tenantId}
        LIMIT 1
      `;
      if (!allowed[0]) {
        throw new AppError("conversation_not_found", 404, "Диалог не найден.");
      }

      const last = uiMessages.at(-1);
      const text = messageText(last);
      if (last?.role === "user" && text) {
        // Распознанный intent сохраняем для распределения обращений.
        const intent = detectIntent(text);
        await sql`
          INSERT INTO messages (
            tenant_id, conversation_id, sender_type, sender_user_id, content, surface, intent
          ) VALUES (
            ${user.tenantId}, ${input.conversationId}, 'operator', ${user.id},
            ${text}, 'operator_assistant', ${intent}
          )
        `;
      }
    }

    const clinicContext = await clinicContextPromise;

    if (process.env.AI_RUNTIME !== "openai" || !process.env.OPENAI_API_KEY) {
      return safeModeResponse({
        input,
        uiMessages,
        sql,
        tenantId: user.tenantId,
        clinicContext,
      });
    }

    const result = streamText({
      model: openai(process.env.OPENAI_MODEL || "gpt-5.6"),
      system: `${SYSTEM_PROMPT}\n\n${formatClinicAiContext(clinicContext)}`,
      messages: await convertToModelMessages(uiMessages),
      providerOptions: {
        openai: {
          store: false,
          reasoningEffort: "low",
          textVerbosity: "low",
          safetyIdentifier: user.id,
        },
      },
      onFinish: async ({ text }) => {
        if (input.conversationId && text.trim()) {
          await sql`
            INSERT INTO messages (
              tenant_id, conversation_id, sender_type, content, model, surface
            ) VALUES (
              ${user.tenantId}, ${input.conversationId}, 'assistant',
              ${text.trim()}, ${process.env.OPENAI_MODEL || "gpt-5.6"},
              'operator_assistant'
            )
          `;
        }
        if (text.trim()) {
          await recordUsage(sql, user.tenantId, "ai_messages");
        }
        await maybeEscalate(uiMessages, user.tenantId, input.conversationId);
      },
    });

    return result.toUIMessageStreamResponse({
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
