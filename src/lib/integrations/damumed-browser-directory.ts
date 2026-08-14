import "server-only";

import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import type { DamuMedDirectorySnapshotInput } from "@/lib/validation/damumed-browser";

export async function ingestDamuMedDirectorySnapshot(input: DamuMedDirectorySnapshotInput) {
  const sql = db();
  const tenant = (await sql`
    SELECT id FROM tenants WHERE id = ${input.tenantId} AND status = 'active' LIMIT 1
  `) as Array<{ id: string }>;
  if (!tenant[0]) throw new AppError("tenant_not_found", 404, "Клиника для снимка расписания не найдена.");

  const captureId = randomUUID();
  const statements = [];
  for (const doctor of input.doctors) {
    const doctorId = randomUUID();
    const observationId = randomUUID();
    if (doctor.specialty) {
      statements.push(sql`
        INSERT INTO specialties (tenant_id, name)
        VALUES (${input.tenantId}, ${doctor.specialty})
        ON CONFLICT (tenant_id, name) DO NOTHING
      `);
    }
    statements.push(sql`
      INSERT INTO doctors (
        id, tenant_id, specialty_id, full_name, display_name, room, active, external_id
      ) VALUES (
        ${doctorId}, ${input.tenantId},
        (SELECT id FROM specialties WHERE tenant_id = ${input.tenantId} AND name = ${doctor.specialty} LIMIT 1),
        ${doctor.name}, ${doctor.name}, ${doctor.room}, true, ${doctor.externalId}
      )
      ON CONFLICT (tenant_id, external_id) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        display_name = EXCLUDED.display_name,
        specialty_id = EXCLUDED.specialty_id,
        room = EXCLUDED.room,
        active = true
    `);
    statements.push(sql`
      DELETE FROM external_schedule_observations
      WHERE tenant_id = ${input.tenantId}
        AND provider = 'damumed'
        AND doctor_id = (SELECT id FROM doctors WHERE tenant_id = ${input.tenantId} AND external_id = ${doctor.externalId})
        AND schedule_date = ${input.scheduleDate}
    `);
    statements.push(sql`
      INSERT INTO external_schedule_observations (
        id, capture_id, tenant_id, provider, doctor_id, schedule_date,
        observed_at, source_url, free_count
      ) VALUES (
        ${observationId}, ${captureId}, ${input.tenantId}, 'damumed',
        (SELECT id FROM doctors WHERE tenant_id = ${input.tenantId} AND external_id = ${doctor.externalId}),
        ${input.scheduleDate}, ${input.observedAt}, ${input.sourceUrl},
        ${doctor.slots.filter((slot) => slot.status === "available").length}
      )
    `);
    for (const slot of doctor.slots) {
      statements.push(sql`
        INSERT INTO external_schedule_slots (
          id, observation_id, tenant_id, doctor_id, starts_at, ends_at, status, observed_at
        ) VALUES (
          ${randomUUID()}, ${observationId}, ${input.tenantId},
          (SELECT id FROM doctors WHERE tenant_id = ${input.tenantId} AND external_id = ${doctor.externalId}),
          ${slot.startsAt}, ${slot.endsAt}, ${slot.status}, ${input.observedAt}
        )
      `);
    }
  }

  await sql.transaction(statements);
  return {
    captureId,
    doctors: input.doctors.length,
    availableSlots: input.doctors.reduce(
      (total, doctor) => total + doctor.slots.filter((slot) => slot.status === "available").length,
      0,
    ),
  };
}
