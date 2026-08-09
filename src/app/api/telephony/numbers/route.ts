import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRoles } from "@/lib/dal/auth";
import { apiError, AppError } from "@/lib/errors";
import { phoneNumberSchema } from "@/lib/validation/voice";

export async function POST(request: Request) {
  try {
    const user = await requireRoles(["clinic_admin"]);
    const input = phoneNumberSchema.parse(await request.json());
    const sql = db();
    const id = randomUUID();
    try {
      const rows = await sql`
        INSERT INTO phone_numbers (
          id, tenant_id, e164, label, provider, voice, greeting, languages, status
        ) VALUES (
          ${id}, ${user.tenantId}, ${input.e164}, ${input.label}, ${input.provider},
          ${input.voice}, ${input.greeting || null}, ${input.languages},
          ${input.active ? "active" : "pending"}
        )
        ON CONFLICT (e164) DO UPDATE SET
          label = EXCLUDED.label,
          provider = EXCLUDED.provider,
          voice = EXCLUDED.voice,
          greeting = EXCLUDED.greeting,
          languages = EXCLUDED.languages,
          status = EXCLUDED.status,
          updated_at = now()
        WHERE phone_numbers.tenant_id = ${user.tenantId}
        RETURNING id, e164, label, provider, voice, languages, status
      `;
      if (!rows[0]) {
        throw new AppError(
          "phone_number_owned_by_another_tenant",
          409,
          "Этот номер уже привязан к другой клинике.",
        );
      }
      await sql`
        INSERT INTO audit_events (tenant_id, actor_user_id, action, resource_type, resource_id)
        VALUES (${user.tenantId}, ${user.id}, 'telephony.number.configured', 'phone_number', ${String(rows[0].id)})
      `;
      return NextResponse.json({ number: rows[0] }, { status: 201 });
    } catch (error) {
      if ((error as { code?: string }).code === "23505") {
        throw new AppError(
          "phone_number_already_configured",
          409,
          "Этот номер уже настроен.",
        );
      }
      throw error;
    }
  } catch (error) {
    return apiError(error);
  }
}
