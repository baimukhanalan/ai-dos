import { createHash } from "node:crypto";
import { z } from "zod";
import { requireUser } from "@/lib/dal/auth";
import { runBookingTurnForTenant } from "@/lib/dal/booking";
import { runPatientAppointmentTurnForTenant } from "@/lib/dal/patient-appointments";
import {
  createCallbackForTenant,
  findAvailableSlots,
  listPublicDoctors,
  listPublicServices,
} from "@/lib/dal/operations";
import {
  listClinicBranches,
  searchClinicKnowledge,
} from "@/lib/ai/clinic-context";
import { db } from "@/lib/db";
import { apiError, AppError } from "@/lib/errors";
import { callbackSchema } from "@/lib/validation/operations";
import { verifyPatientIdentity } from "@/lib/dal/identity";
import { isVerifiedVoicePatient } from "@/lib/voice/patient-context";
import {
  buildDoctorDirectoryAnswer,
  type DoctorDirectoryEntry,
} from "@/lib/ai/doctor-directory";

export const runtime = "nodejs";

const toolNames = [
  "search_clinic_knowledge",
  "list_clinic_services",
  "list_doctors",
  "find_available_slots",
  "list_clinic_branches",
  "verify_patient_identity",
  "booking_turn",
  "patient_appointment_turn",
  "create_callback_request",
] as const;

const requestSchema = z.object({
  sessionId: z.string().uuid(),
  callId: z.string().trim().min(1).max(160),
  name: z.enum(toolNames),
  args: z.record(z.string(), z.unknown()).default({}),
});

const searchSchema = z.object({
  query: z.string().trim().min(2).max(200),
  locale: z.enum(["ru", "kk", "en"]).optional(),
});

const serviceSchema = z.object({
  query: z.string().trim().min(2).max(120).optional(),
});

const doctorSchema = z.object({
  specialty: z.string().trim().min(2).max(120).optional(),
});

const slotsSchema = z.object({
  doctorId: z.string().uuid(),
  days: z.number().int().min(1).max(14).default(7),
});

const bookingToolSchema = z.object({
  message: z.string().trim().min(1).max(1000),
  patientId: z.string().uuid().optional(),
});

const patientAppointmentToolSchema = z.object({
  message: z.string().trim().min(1).max(1000),
  patientId: z.string().uuid(),
  language: z.enum(["ru", "kk", "en"]).optional(),
});

const identityToolSchema = z
  .object({
    phone: z.string().trim().min(7).max(24),
    surname: z.string().trim().min(2).max(120).optional(),
    birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .refine((value) => Boolean(value.surname || value.birthDate), {
    message: "Укажите фамилию или дату рождения.",
  });

const callbackToolSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(7).max(24),
  reason: z.string().trim().min(3).max(500),
  preferredTime: z.string().trim().max(120).optional(),
  priority: z.enum(["normal", "high", "urgent"]).default("normal"),
  confirmed: z.literal(true),
});

function includesQuery(
  row: Record<string, unknown>,
  query: string | undefined,
) {
  if (!query) return true;
  const needle = query.toLocaleLowerCase("ru-KZ");
  return Object.values(row).some(
    (value) =>
      typeof value === "string" &&
      value.toLocaleLowerCase("ru-KZ").includes(needle),
  );
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = requestSchema.parse(await request.json());
    const sql = db();
    const sessions = (await sql`
      SELECT id, patient_id, conversation_id, requested_language
      FROM voice_sessions
      WHERE id = ${input.sessionId}
        AND tenant_id = ${user.tenantId}
        AND user_id = ${user.id}
        AND status IN ('created', 'connected')
        AND started_at > now() - interval '35 minutes'
      LIMIT 1
    `) as Array<{
      id: string;
      patient_id: string | null;
      conversation_id: string | null;
      requested_language: string;
    }>;
    const session = sessions[0];
    if (!session) {
      throw new AppError(
        "voice_session_not_found",
        404,
        "Активная голосовая сессия не найдена.",
      );
    }

    let data: unknown;
    switch (input.name) {
      case "search_clinic_knowledge": {
        const args = searchSchema.parse(input.args);
        const asksAboutDoctors =
          /врач|доктор|специал|график|расписан|дәрігер|маман|doctor|specialist|schedule/i.test(
            args.query,
          );
        const [articles, activeDoctors] = await Promise.all([
          searchClinicKnowledge({
            tenantId: user.tenantId,
            query: args.query,
            locale: args.locale,
          }),
          asksAboutDoctors ? listPublicDoctors(user.tenantId) : Promise.resolve([]),
        ]);
        data = {
          articles,
          ...(asksAboutDoctors
            ? {
                activeDoctors,
                exactDoctorAnswer: buildDoctorDirectoryAnswer(
                  activeDoctors as unknown as DoctorDirectoryEntry[],
                ),
              }
            : {}),
        };
        break;
      }
      case "list_clinic_services": {
        const args = serviceSchema.parse(input.args);
        const rows = (await listPublicServices(user.tenantId)) as Array<
          Record<string, unknown>
        >;
        data = {
          services: rows.filter((row) => includesQuery(row, args.query)),
        };
        break;
      }
      case "list_doctors": {
        const args = doctorSchema.parse(input.args);
        const [structuredDoctors, publishedKnowledge] = await Promise.all([
          listPublicDoctors(user.tenantId, args.specialty),
          searchClinicKnowledge({
            tenantId: user.tenantId,
            query: `${args.specialty || ""} врачи специалисты график расписание`.trim(),
          }),
        ]);
        data = {
          sourcePolicy:
            "The exactDoctorAnswer is generated server-side from the current tenant's active doctor directory and weekly schedule. Follow it exactly. Published knowledge supplies additional clinic wording. Never mention a doctor absent from activeDoctors.",
          exactDoctorAnswer: buildDoctorDirectoryAnswer(
            structuredDoctors as unknown as DoctorDirectoryEntry[],
          ),
          publishedKnowledge,
          activeDoctors: structuredDoctors,
        };
        break;
      }
      case "find_available_slots": {
        const args = slotsSchema.parse(input.args);
        data = {
          slots: await findAvailableSlots(
            user.tenantId,
            args.doctorId,
            args.days,
          ),
          timezone: user.timezone,
        };
        break;
      }
      case "list_clinic_branches": {
        data = { branches: await listClinicBranches(user.tenantId) };
        break;
      }
      case "verify_patient_identity": {
        const args = identityToolSchema.parse(input.args);
        const identity = await verifyPatientIdentity(sql, user.tenantId, {
          phone: args.phone,
          fullName: args.surname,
          birthDate: args.birthDate,
        });
        data = identity;
        if (identity.status === "verified") {
          await sql`
            UPDATE voice_sessions
            SET patient_id = ${identity.patientId}, patient_verified_at = now()
            WHERE id = ${input.sessionId} AND tenant_id = ${user.tenantId}
          `;
          session.patient_id = identity.patientId;
        }
        break;
      }
      case "booking_turn": {
        const args = bookingToolSchema.parse(input.args);
        if (!isVerifiedVoicePatient(session.patient_id, args.patientId)) {
          throw new AppError(
            "voice_patient_not_verified",
            403,
            "Сначала подтвердите личность пациента в этой голосовой сессии.",
          );
        }
        // Ход ведёт тот же движок, что и веб-канал, поэтому исход и причина
        // отказа попадают в общую аналитику независимо от канала.
        data = await runBookingTurnForTenant(user.tenantId, user.id, {
          message: args.message,
          patientId: session.patient_id!,
          conversationId: session.conversation_id,
          channel: "phone",
        });
        break;
      }
      case "patient_appointment_turn": {
        const args = patientAppointmentToolSchema.parse(input.args);
        if (
          !isVerifiedVoicePatient(session.patient_id, args.patientId, true)
          || !session.conversation_id
        ) {
          throw new AppError(
            "voice_patient_not_verified",
            403,
            "Сначала подтвердите личность пациента в этой голосовой сессии.",
          );
        }
        data = await runPatientAppointmentTurnForTenant(user.tenantId, {
          message: args.message,
          patientId: session.patient_id!,
          conversationId: session.conversation_id,
          language:
            args.language
            ?? (session.requested_language === "kk" || session.requested_language === "en"
              ? session.requested_language
              : "ru"),
          channel: "phone",
        });
        break;
      }
      case "create_callback_request": {
        const args = callbackToolSchema.parse(input.args);
        const idempotencyKey = createHash("sha256")
          .update(`${input.sessionId}:${input.callId}`)
          .digest("hex");
        data = await createCallbackForTenant(
          user.tenantId,
          callbackSchema.parse({
            name: args.name,
            phone: args.phone,
            reason: args.reason,
            preferredTime: args.preferredTime,
            priority: args.priority,
            idempotencyKey,
          }),
          user.id,
        );
        break;
      }
    }

    await sql`
      INSERT INTO audit_events (
        tenant_id, actor_user_id, action, resource_type, resource_id, metadata
      ) VALUES (
        ${user.tenantId}, ${user.id}, 'voice.tool.executed', 'voice_session',
        ${input.sessionId},
        ${JSON.stringify({ tool: input.name, callId: input.callId })}::jsonb
      )
    `;

    return Response.json(
      { ok: true, data },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
