import { z } from "zod";
import { changeAppointment } from "@/lib/dal/operations";
import { apiError } from "@/lib/errors";
import { appointmentChangeSchema } from "@/lib/validation/operations";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    z.string().uuid().parse(id);
    const input = appointmentChangeSchema.parse(await request.json());
    const result = await changeAppointment(id, input);
    return Response.json({ ok: true, data: result });
  } catch (error) {
    return apiError(error);
  }
}
