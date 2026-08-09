import { z } from "zod";
import { apiError } from "@/lib/errors";
import { db } from "@/lib/db";
import { requireRoles } from "@/lib/dal/auth";
import { verifyPatientIdentity } from "@/lib/dal/identity";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  phone: z.string().trim().min(6).max(20),
  fullName: z.string().trim().max(160).optional(),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/**
 * Подтверждение личности пациента для чувствительных действий. Возвращает
 * только статус — никаких данных пациента наружу. По одному имени не находит.
 */
export async function POST(request: Request) {
  try {
    const user = await requireRoles(["clinic_admin", "operator"]);
    const input = bodySchema.parse(await request.json());
    const result = await verifyPatientIdentity(db(), user.tenantId, input);
    return Response.json({ ok: true, result });
  } catch (error) {
    return apiError(error);
  }
}
