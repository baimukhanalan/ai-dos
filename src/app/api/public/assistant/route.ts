import { createHash } from "node:crypto";
import { classifyEscalation, detectIntent } from "@/lib/ai/escalation";
import { loadClinicAiContext } from "@/lib/ai/clinic-context";
import { safeAssistantReply } from "@/lib/ai/safe-assistant";
import { runBookingTurnForTenant } from "@/lib/dal/booking";
import { matchDoctor, type DoctorOption } from "@/lib/booking/flow";
import { registerPublicPatient, verifyPatientIdentity } from "@/lib/dal/identity";
import { recordEscalation } from "@/lib/dal/escalations";
import {
  createCallbackForTenant,
  findAvailableSlots,
  listPublicDoctors,
  resolvePublicTenant,
} from "@/lib/dal/operations";
import { db } from "@/lib/db";
import { apiError, AppError } from "@/lib/errors";
import {
  bindVerifiedPatient,
  getOrCreatePatientWebSession,
} from "@/lib/public/patient-session";
import {
  isCallbackRequest,
  isExplicitBookingRequest,
} from "@/lib/public/routing";
import { publicAssistantRequestSchema } from "@/lib/validation/public-assistant";
import { callbackSchema } from "@/lib/validation/operations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 12_000;

async function readBody(request: Request) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > MAX_BODY_BYTES) {
    throw new AppError("payload_too_large", 413, "Сообщение слишком большое.");
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    throw new AppError("payload_too_large", 413, "Сообщение слишком большое.");
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new AppError("invalid_json", 400, "Некорректный формат запроса.");
  }
}

function localizedIdentityPrompt(locale: "ru" | "kk" | "en") {
  if (locale === "kk") {
    return "Жазылуды жалғастыру үшін жеке басыңызды растаңыз: телефон нөмірі және тегіңіз немесе туған күніңіз қажет.";
  }
  if (locale === "en") {
    return "To continue booking, verify your identity with your phone number and either your surname or date of birth.";
  }
  return "Чтобы продолжить запись, подтвердите личность: укажите номер телефона и фамилию или дату рождения.";
}

function localizedNotFound(locale: "ru" | "kk" | "en") {
  if (locale === "kk") return "Деректер сәйкес келмеді. Оларды тексеріңіз немесе жаңа пациент ретінде тіркеліңіз.";
  if (locale === "en") return "The details did not match. Check them or register as a new patient.";
  return "Данные не совпали. Проверьте их или зарегистрируйтесь как новый пациент.";
}

function localizedPatientExists(locale: "ru" | "kk" | "en") {
  if (locale === "kk") return "Бұл телефон нөмірі клиникада бар. Телефон және тегіңіз немесе туған күніңіз арқылы жеке басыңызды растаңыз.";
  if (locale === "en") return "This phone number already exists at the clinic. Verify with your phone and either surname or date of birth.";
  return "Этот номер уже есть в клинике. Подтвердите личность по телефону и фамилии или дате рождения.";
}

function localizedCallbackCreated(locale: "ru" | "kk" | "en") {
  if (locale === "kk") return "Кері қоңырау өтініші тіркелді. Клиника қызметкері сізбен хабарласады.";
  if (locale === "en") return "Your callback request is recorded. A clinic staff member will contact you.";
  return "Заявка на обратный звонок создана. Сотрудник клиники свяжется с вами.";
}

type PublicDoctor = {
  id: string;
  display_name: string;
  specialty: string | null;
};

function doctorOptions(doctors: PublicDoctor[]): DoctorOption[] {
  return doctors.map((doctor) => ({
    id: doctor.id,
    name: doctor.display_name,
    specialty: doctor.specialty,
  }));
}

function localizedDoctorChoice(
  locale: "ru" | "kk" | "en",
  doctors: PublicDoctor[],
) {
  const list = doctors
    .map((doctor) => `• ${doctor.display_name}${doctor.specialty ? ` — ${doctor.specialty}` : ""}`)
    .join("\n");
  if (locale === "kk") {
    return `Бос уақытты көрсету үшін дәрігерді таңдаңыз:\n${list}\n\nМысалы: «${doctors[0]?.display_name ?? "дәрігер"} дәрігерінің бос уақыты».`;
  }
  if (locale === "en") {
    return `Choose a doctor to see real available times:\n${list}\n\nFor example: “Available times with ${doctors[0]?.display_name ?? "the doctor"}”.`;
  }
  return `Чтобы показать реальные свободные окна, выберите врача:\n${list}\n\nНапример: «Свободное время у ${doctors[0]?.display_name ?? "врача"}».`;
}

function localizedAvailability(
  locale: "ru" | "kk" | "en",
  doctor: PublicDoctor,
  slots: Array<{ startsAt: string; durationMinutes: number }>,
  timeZone: string,
) {
  if (!slots.length) {
    if (locale === "kk") return `${doctor.display_name} дәрігерінде алдағы 7 күнге бос уақыт жоқ.`;
    if (locale === "en") return `${doctor.display_name} has no available times in the next 7 days.`;
    return `У врача ${doctor.display_name} нет свободных окон на ближайшие 7 дней.`;
  }
  const intlLocale = locale === "kk" ? "kk-KZ" : locale === "en" ? "en-GB" : "ru-RU";
  const lines = slots.slice(0, 8).map((slot) =>
    `• ${new Intl.DateTimeFormat(intlLocale, {
      weekday: "short",
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone,
    }).format(new Date(slot.startsAt))}`,
  );
  if (locale === "kk") return `${doctor.display_name} дәрігерінің нақты бос уақыты:\n${lines.join("\n")}\n\nЖазылу үшін қолайлы уақытты көрсетіңіз.`;
  if (locale === "en") return `Real available times with ${doctor.display_name}:\n${lines.join("\n")}\n\nTell me which time you want to book.`;
  return `Реальные свободные окна у врача ${doctor.display_name}:\n${lines.join("\n")}\n\nЧтобы записаться, укажите подходящее время.`;
}

async function saveExchange(
  tenantId: string,
  conversationId: string,
  message: string,
  reply: string,
  intent: string,
  model: string,
) {
  const sql = db();
  await sql.transaction([
    sql`
      INSERT INTO messages (tenant_id, conversation_id, sender_type, content, surface, intent)
      VALUES (${tenantId}, ${conversationId}, 'patient', ${message},
        'patient_conversation', ${intent})
    `,
    sql`
      INSERT INTO messages (tenant_id, conversation_id, sender_type, content, model, surface)
      VALUES (${tenantId}, ${conversationId}, 'assistant', ${reply},
        ${model}, 'patient_conversation')
    `,
  ]);
}

async function enforcePublicRateLimit(
  request: Request,
  scope = "chat",
  limit = 60,
) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const source = forwarded || request.headers.get("x-real-ip") || "unknown";
  const identifier = `public-assistant:${scope}:${createHash("sha256").update(source).digest("hex")}`;
  const sql = db();
  const rows = (await sql`
    INSERT INTO auth_rate_limits (
      identifier, attempts, window_started_at, blocked_until, updated_at
    ) VALUES (${identifier}, 1, now(), null, now())
    ON CONFLICT (identifier) DO UPDATE SET
      attempts = CASE
        WHEN auth_rate_limits.window_started_at < now() - interval '1 hour' THEN 1
        ELSE auth_rate_limits.attempts + 1
      END,
      window_started_at = CASE
        WHEN auth_rate_limits.window_started_at < now() - interval '1 hour' THEN now()
        ELSE auth_rate_limits.window_started_at
      END,
      blocked_until = CASE
        WHEN auth_rate_limits.blocked_until > now() THEN auth_rate_limits.blocked_until
        WHEN auth_rate_limits.window_started_at < now() - interval '1 hour' THEN null
        WHEN auth_rate_limits.attempts + 1 > ${limit} THEN now() + interval '1 hour'
        ELSE null
      END,
      updated_at = now()
    RETURNING blocked_until
  `) as Array<{ blocked_until: string | null }>;
  if (rows[0]?.blocked_until) {
    throw new AppError(
      "public_chat_rate_limited",
      429,
      "Слишком много сообщений. Повторите позже или позвоните в клинику.",
    );
  }
}

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const origin = request.headers.get("origin");
    if (origin && origin !== url.origin) {
      throw new AppError("origin_not_allowed", 403, "Источник запроса не разрешён.");
    }
    await enforcePublicRateLimit(request);
    const input = publicAssistantRequestSchema.parse(await readBody(request));
    const tenant = await resolvePublicTenant();
    const session = await getOrCreatePatientWebSession(tenant.id, input.locale);
    const sql = db();

    let patientId = session.patientId;
    let verified = session.verified;
    if (input.registration && !verified) {
      const identityPrompts = (await sql`
        SELECT 1 FROM messages
        WHERE tenant_id = ${tenant.id}
          AND conversation_id = ${session.conversationId}
          AND model = 'ai-dos-public-identity'
          AND created_at > now() - interval '15 minutes'
        LIMIT 1
      `) as Array<{ exists: number }>;
      if (!identityPrompts[0]) {
        throw new AppError(
          "registration_not_requested",
          409,
          "Сначала начните запись или запросите обратный звонок.",
        );
      }
      await enforcePublicRateLimit(request, "registration", 3);
      const registration = await registerPublicPatient(sql, tenant.id, {
        fullName: input.registration.fullName,
        phone: input.registration.phone,
        birthDate: input.registration.birthDate,
        preferredLanguage: input.locale,
      });
      if (registration.status === "exists") {
        return Response.json(
          {
            ok: true,
            data: {
              clinic: tenant.name,
              conversationId: session.conversationId,
              reply: localizedPatientExists(input.locale),
              verified: false,
              requiresIdentity: true,
              canRegister: false,
              stage: null,
              outcome: null,
              slots: [],
            },
          },
          { headers: { "Cache-Control": "no-store" } },
        );
      }
      patientId = registration.patientId;
      verified = true;
      await bindVerifiedPatient(tenant.id, session.id, registration.patientId);
    }
    if (input.identity && !verified) {
      const identity = await verifyPatientIdentity(sql, tenant.id, {
        phone: input.identity.phone,
        fullName: input.identity.surname,
        birthDate: input.identity.birthDate,
      });
      if (identity.status !== "verified") {
        return Response.json(
          {
            ok: true,
            data: {
              clinic: tenant.name,
              conversationId: session.conversationId,
              reply: localizedNotFound(input.locale),
              verified: false,
              requiresIdentity: true,
              canRegister: true,
              stage: null,
              outcome: null,
              slots: [],
            },
          },
          { headers: { "Cache-Control": "no-store" } },
        );
      }
      patientId = identity.patientId;
      verified = true;
      await bindVerifiedPatient(tenant.id, session.id, identity.patientId);
    }

    const escalation = classifyEscalation(input.message);
    if (escalation.shouldEscalate) {
      const context = await loadClinicAiContext(tenant.id);
      const reply = safeAssistantReply(input.message, context);
      await sql.transaction([
        sql`
          INSERT INTO messages (tenant_id, conversation_id, sender_type, content, surface, intent)
          VALUES (${tenant.id}, ${session.conversationId}, 'patient', ${input.message},
            'patient_conversation', ${escalation.intent})
        `,
        sql`
          INSERT INTO messages (tenant_id, conversation_id, sender_type, content, model, surface)
          VALUES (${tenant.id}, ${session.conversationId}, 'assistant', ${reply},
            'ai-dos-public-safety', 'patient_conversation')
        `,
      ]);
      await recordEscalation(tenant.id, {
        conversationId: session.conversationId,
        patientId,
        channel: "web",
        intent: escalation.intent,
        reason: escalation.reason,
        priority: escalation.priority,
        summary: `Публичный чат: ${input.message.slice(0, 600)}`,
        attemptedActions: [{ action: "safety_reply", result: reply.slice(0, 300) }],
        dedupeKey: `public-chat:${session.conversationId}`,
      });
      return Response.json({
        ok: true,
        data: {
          clinic: tenant.name,
          conversationId: session.conversationId,
          reply,
          verified,
          requiresIdentity: false,
          stage: null,
          outcome: "escalated",
          slots: [],
        },
      });
    }

    const openBooking = await sql`
      SELECT id FROM booking_sessions
      WHERE tenant_id = ${tenant.id} AND conversation_id = ${session.conversationId}
        AND outcome IS NULL
      LIMIT 1
    `;
    const wantsCallback = isCallbackRequest(input.message);
    if (wantsCallback && !verified) {
      const reply = localizedIdentityPrompt(input.locale);
      await sql`
          INSERT INTO messages (tenant_id, conversation_id, sender_type, content, model, surface)
          VALUES (${tenant.id}, ${session.conversationId}, 'assistant', ${reply},
            'ai-dos-public-identity', 'patient_conversation')
        `;
      return Response.json({
        ok: true,
        data: {
          clinic: tenant.name,
          conversationId: session.conversationId,
          reply,
          verified: false,
          requiresIdentity: true,
          canRegister: true,
          stage: null,
          outcome: null,
          slots: [],
        },
      });
    }
    if (wantsCallback && patientId) {
      const patients = (await sql`
        SELECT full_name, phone FROM patients
        WHERE id = ${patientId} AND tenant_id = ${tenant.id}
        LIMIT 1
      `) as Array<{ full_name: string; phone: string | null }>;
      const patient = patients[0];
      if (!patient?.phone) {
        throw new AppError("patient_phone_missing", 409, "В карте пациента нет номера телефона.");
      }
      await createCallbackForTenant(
        tenant.id,
        callbackSchema.parse({
          name: patient.full_name,
          phone: patient.phone,
          reason: input.message,
          priority: "normal",
          idempotencyKey: `public:${session.id}:callback`,
        }),
        null,
      );
      const reply = localizedCallbackCreated(input.locale);
      await sql.transaction([
        sql`
          INSERT INTO messages (tenant_id, conversation_id, sender_type, content, surface, intent)
          VALUES (${tenant.id}, ${session.conversationId}, 'patient', ${input.message},
            'patient_conversation', 'human')
        `,
        sql`
          INSERT INTO messages (tenant_id, conversation_id, sender_type, content, model, surface)
          VALUES (${tenant.id}, ${session.conversationId}, 'assistant', ${reply},
            'ai-dos-public-callback', 'patient_conversation')
        `,
      ]);
      return Response.json({
        ok: true,
        data: {
          clinic: tenant.name,
          conversationId: session.conversationId,
          reply,
          verified: true,
          requiresIdentity: false,
          stage: null,
          outcome: null,
          slots: [],
        },
      });
    }
    const intent = detectIntent(input.message);
    const wantsBooking =
      intent === "book" &&
      isExplicitBookingRequest(input.message);

    if (intent === "book" && !wantsBooking && !openBooking[0]) {
      const doctors = (await listPublicDoctors(tenant.id)) as PublicDoctor[];
      const selected = matchDoctor(input.message, doctorOptions(doctors));
      const doctor = selected
        ? doctors.find((candidate) => candidate.id === selected.id) ?? null
        : null;
      const slots = doctor ? await findAvailableSlots(tenant.id, doctor.id, 7) : [];
      const reply = doctor
        ? localizedAvailability(input.locale, doctor, slots, tenant.timezone)
        : localizedDoctorChoice(input.locale, doctors);
      await saveExchange(
        tenant.id,
        session.conversationId,
        input.message,
        reply,
        "book",
        "ai-dos-public-availability",
      );
      return Response.json(
        {
          ok: true,
          data: {
            clinic: tenant.name,
            conversationId: session.conversationId,
            reply,
            verified,
            requiresIdentity: false,
            stage: null,
            outcome: null,
            slots,
          },
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if ((wantsBooking || openBooking[0]) && !verified) {
      const reply = localizedIdentityPrompt(input.locale);
      await sql`
          INSERT INTO messages (tenant_id, conversation_id, sender_type, content, model, surface)
          VALUES (${tenant.id}, ${session.conversationId}, 'assistant', ${reply},
            'ai-dos-public-identity', 'patient_conversation')
        `;
      return Response.json({
        ok: true,
        data: {
          clinic: tenant.name,
          conversationId: session.conversationId,
          reply,
          verified: false,
          requiresIdentity: true,
          canRegister: true,
          stage: null,
          outcome: null,
          slots: [],
        },
      });
    }

    if ((wantsBooking || openBooking[0]) && patientId) {
      const turn = await runBookingTurnForTenant(tenant.id, null, {
        message: input.message,
        patientId,
        conversationId: session.conversationId,
        channel: "web",
      });
      return Response.json({
        ok: true,
        data: {
          clinic: tenant.name,
          conversationId: session.conversationId,
          reply: turn.reply,
          verified: true,
          requiresIdentity: false,
          stage: turn.stage,
          outcome: turn.outcome,
          appointmentId: turn.appointmentId,
          slots: turn.offeredSlots,
        },
      });
    }

    const context = await loadClinicAiContext(tenant.id);
    const reply = safeAssistantReply(input.message, context);
    await sql.transaction([
      sql`
        INSERT INTO messages (tenant_id, conversation_id, sender_type, content, surface, intent)
        VALUES (${tenant.id}, ${session.conversationId}, 'patient', ${input.message},
          'patient_conversation', ${detectIntent(input.message)})
      `,
      sql`
        INSERT INTO messages (tenant_id, conversation_id, sender_type, content, model, surface)
        VALUES (${tenant.id}, ${session.conversationId}, 'assistant', ${reply},
          'ai-dos-public-grounded', 'patient_conversation')
      `,
    ]);
    return Response.json(
      {
        ok: true,
        data: {
          clinic: tenant.name,
          conversationId: session.conversationId,
          reply,
          verified,
          requiresIdentity: false,
          stage: null,
          outcome: null,
          slots: [],
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
