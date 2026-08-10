import { listBookingSessions, runBookingTurn } from "@/lib/dal/booking";
import { apiError } from "@/lib/errors";
import { bookingTurnSchema } from "@/lib/validation/booking";

export const dynamic = "force-dynamic";

/**
 * Один ход разговорной записи. Ответ пациенту и исход возвращаются вместе:
 * «записан» звучит только тогда, когда запись подтверждена базой.
 */
export async function POST(request: Request) {
  try {
    const input = bookingTurnSchema.parse(await request.json());
    const result = await runBookingTurn(input);
    return Response.json({ ok: true, data: result });
  } catch (error) {
    return apiError(error);
  }
}

export async function GET() {
  try {
    const sessions = await listBookingSessions();
    return Response.json({ ok: true, data: sessions });
  } catch (error) {
    return apiError(error);
  }
}
