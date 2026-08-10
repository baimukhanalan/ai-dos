import { closeAbandonedBookingSessions } from "@/lib/booking/abandon";
import { authorizeCron, cronUnauthorized } from "@/lib/cron";
import { apiError } from "@/lib/errors";
import {
  deliveryReadiness,
  dispatchDueNotifications,
} from "@/lib/notifications/dispatcher";
import { runMisSync } from "@/lib/integrations/mis-sync";
import { processOutbox } from "@/lib/notifications/outbox";
import { enqueueAppointmentReminders } from "@/lib/notifications/reminders";
import { runNoShowSweep } from "@/lib/scheduling/no-show";
import { runWaitlistMatching } from "@/lib/scheduling/waitlist";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Один проход операционных воркеров. Порядок важен: no-show, напоминания и
 * лист ожидания порождают события, которые тут же превращаются в уведомления
 * и уходят провайдеру в этом же запуске.
 *
 * Маршрут идемпотентен и рассчитан на любой интервал: запуск раз в сутки на
 * Vercel Hobby и раз в 15 минут на Pro или внешнем планировщике дают один и
 * тот же результат, отличается только задержка доставки.
 */
export async function GET(request: Request) {
  if (!authorizeCron(request)) return cronUnauthorized();

  try {
    const noShow = await runNoShowSweep();
    const reminders = await enqueueAppointmentReminders();
    // Брошенные диалоги записи закрываем до листа ожидания: часть из них
    // оставляет пациента в очереди, и предложение уходит в этом же прогоне.
    const abandonedBookings = await closeAbandonedBookingSessions();
    const waitlist = await runWaitlistMatching();
    const misSync = await runMisSync();
    const outbox = await processOutbox();
    const delivery = await dispatchDueNotifications();

    return Response.json({
      ok: true,
      noShow,
      reminders,
      abandonedBookings,
      waitlist,
      misSync,
      outbox,
      delivery,
      channels: deliveryReadiness().channels.map((channel) => ({
        channel: channel.channel,
        configured: channel.configured,
      })),
    });
  } catch (error) {
    return apiError(error);
  }
}
