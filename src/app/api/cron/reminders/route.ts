import { authorizeCron, cronUnauthorized } from "@/lib/cron";
import { apiError } from "@/lib/errors";
import { db } from "@/lib/db";
import { enqueueAppointmentReminders } from "@/lib/notifications/reminders";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request) {
  if (!authorizeCron(request)) return cronUnauthorized();

  try {
    const reminders = await enqueueAppointmentReminders();
    const sql = db();
    const queued = (await sql`
      SELECT count(*)::int AS count
      FROM outbox_events
      WHERE status IN ('pending', 'failed') AND available_at <= now()
    `) as Array<{ count: number }>;

    return Response.json({
      ok: true,
      remindersCreated: reminders.created,
      reminderStatus: "queued",
      outboxQueued: queued[0]?.count || 0,
    });
  } catch (error) {
    return apiError(error);
  }
}
