import { createDoctorAvailability } from "@/lib/dal/doctor";
import { apiError } from "@/lib/errors";
import { doctorAvailabilitySchema } from "@/lib/validation/doctor";

export async function POST(request: Request) {
  try {
    const input = doctorAvailabilitySchema.parse(await request.json());
    const data = await createDoctorAvailability(input);
    return Response.json({ ok: true, data }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
