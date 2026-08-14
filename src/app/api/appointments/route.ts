import { createAppointment, findAvailableSlots } from "@/lib/dal/operations";
import { requireUser } from "@/lib/dal/auth";
import { linkedDoctorId } from "@/lib/dal/doctor";
import { AppError } from "@/lib/errors";
import { apiError } from "@/lib/errors";
import { appointmentSchema } from "@/lib/validation/operations";
import { z } from "zod";

const slotsQuerySchema = z.object({
  doctorId: z.string().uuid(),
  days: z.coerce.number().int().min(1).max(14).default(7),
});

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const url = new URL(request.url);
    const query = slotsQuerySchema.parse({
      doctorId: url.searchParams.get("doctorId"),
      days: url.searchParams.get("days") || 7,
    });
    if (user.role === "doctor") {
      const ownDoctorId = await linkedDoctorId(user);
      if (query.doctorId !== ownDoctorId) {
        throw new AppError("doctor_scope_forbidden", 403, "Доступно только своё расписание.");
      }
    }
    const slots = await findAvailableSlots(
      user.tenantId,
      query.doctorId,
      query.days,
    );
    return Response.json({ ok: true, data: slots });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const input = appointmentSchema.parse(await request.json());
    const appointment = await createAppointment(input);
    return Response.json({ ok: true, data: appointment }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
