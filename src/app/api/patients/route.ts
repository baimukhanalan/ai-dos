import { createPatient } from "@/lib/dal/operations";
import { requireUser } from "@/lib/dal/auth";
import { db } from "@/lib/db";
import { apiError } from "@/lib/errors";
import { patientSchema } from "@/lib/validation/operations";

export async function GET() {
  try {
    const user = await requireUser();
    const sql = db();
    const patients = await sql`
      SELECT id, full_name, phone, email, birth_date, preferred_language, notes, created_at
      FROM patients
      WHERE tenant_id = ${user.tenantId}
      ORDER BY updated_at DESC
      LIMIT 100
    `;
    return Response.json({ ok: true, data: patients });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const input = patientSchema.parse(await request.json());
    const patient = await createPatient(input);
    return Response.json({ ok: true, data: patient }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
