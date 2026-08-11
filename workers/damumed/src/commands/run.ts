import type { Page } from "playwright";
import { config } from "../config.js";
import { log, maskName } from "../log.js";
import { fetchQueue, reportResults, type QueueItem, type SyncResult } from "../aidos.js";
import {
  ensureDesktop,
  openSession,
  pause,
  saveArtifacts,
  SessionExpiredError,
} from "../session.js";
import { PatientNotFoundError, selectPatient } from "../patient.js";
import {
  findSchedule,
  openBookingSection,
  openFreeSlot,
  openScheduleDay,
  ScheduleNotFoundError,
  SlotUnavailableError,
} from "../schedule.js";
import {
  fillBookingForm,
  ServiceNotFoundError,
  submitBookingForm,
  verifyBooking,
} from "../booking.js";
import { clinicDate, externalKey, slotLabel } from "../text.js";

/**
 * Ошибки переводятся в исходы контракта AI Dos. Разделение на retryable и нет
 * здесь не косметическое: повторять то, что не станет валидным (нет пациента,
 * нет услуги, слот занят), — значит жечь бюджет попыток вместо того, чтобы
 * позвать человека.
 */
function toResult(error: unknown): SyncResult {
  if (error instanceof SessionExpiredError) {
    return { status: "unavailable", message: error.message.slice(0, 300) };
  }
  if (error instanceof PatientNotFoundError) {
    return {
      status: "failed",
      errorCode: "patient_not_found",
      message: error.message.slice(0, 300),
      retryable: false,
    };
  }
  if (error instanceof ScheduleNotFoundError) {
    return {
      status: "failed",
      errorCode: "schedule_not_found",
      message: error.message.slice(0, 300),
      retryable: true,
    };
  }
  if (error instanceof SlotUnavailableError) {
    return {
      status: "failed",
      errorCode: "slot_taken",
      message: error.message.slice(0, 300),
      retryable: false,
    };
  }
  if (error instanceof ServiceNotFoundError) {
    return {
      status: "failed",
      errorCode: "service_not_found",
      message: error.message.slice(0, 300),
      retryable: false,
    };
  }
  return {
    status: "failed",
    errorCode: "adapter_error",
    message: (error instanceof Error ? error.message : "Неизвестная ошибка").slice(0, 300),
    retryable: true,
  };
}

async function processItem(
  page: Page,
  item: QueueItem,
  options: { dryRun: boolean },
): Promise<SyncResult> {
  const date = clinicDate(item.startsAt, config.timeZone);
  const timeLabel = slotLabel(item.startsAt, item.endsAt, config.timeZone);

  await selectPatient(page, {
    fullName: item.patientFullName,
    birthDate: item.patientBirthDate,
  });
  await openBookingSection(page, date);

  const schedule = await findSchedule(page, item.doctorName, date);
  await openScheduleDay(page, schedule.row);
  await openFreeSlot(page, timeLabel);

  await fillBookingForm(page, {
    reason: config.form.reasonFallback,
    serviceName: item.serviceName,
  });

  if (options.dryRun) {
    log.info("сухой прогон: форма заполнена, сохранение пропущено", {
      appointmentId: item.appointmentId,
      date,
      timeLabel,
    });
    return { status: "unavailable", message: "dry-run: сохранение намеренно пропущено" };
  }

  await submitBookingForm(page);

  const verified = await verifyBooking(page, timeLabel, item.patientFullName);
  return {
    status: "synced",
    externalId: externalKey(schedule.parsed.title, item.startsAt, config.timeZone),
    verified,
  };
}

export async function runOnce(options: { dryRun: boolean }) {
  const items = await fetchQueue();
  if (!items.length) {
    log.info("очередь пуста");
    return { processed: 0 };
  }

  log.info("получена пачка записей", { count: items.length, dryRun: options.dryRun });
  const session = await openSession();
  const results: Array<{ appointmentId: string; durationMs: number; result: SyncResult }> = [];
  let sessionLost = false;

  try {
    await ensureDesktop(session.page);

    for (const item of items) {
      const startedAt = Date.now();

      /**
       * Сессия умерла — остальные записи даже не пробуем: пометим их как
       * «адаптер недоступен», чтобы очередь вернулась через час, не потратив
       * попытки и не дёрнув сотрудника напрасно.
       */
      if (sessionLost) {
        results.push({
          appointmentId: item.appointmentId,
          durationMs: 0,
          result: { status: "unavailable", message: "Сессия DamuMed истекла до обработки" },
        });
        continue;
      }

      let result: SyncResult;
      try {
        result = await processItem(session.page, item, options);
      } catch (error) {
        result = toResult(error);
        if (result.status === "unavailable") sessionLost = true;
        await saveArtifacts(session.page, `fail-${item.appointmentId}`).catch(() => undefined);
        log.error("запись не заведена", {
          appointmentId: item.appointmentId,
          patient: maskName(item.patientFullName),
          result,
        });
      }

      results.push({
        appointmentId: item.appointmentId,
        durationMs: Date.now() - startedAt,
        result,
      });
      await pause(config.actionDelayMs * 2);
    }
  } catch (error) {
    log.error("прогон прерван", { error: String(error) });
  } finally {
    await session.close();
  }

  if (options.dryRun) {
    log.info("сухой прогон завершён, отчёт в AI Dos не отправлен", { results });
    return { processed: results.length };
  }

  const report = await reportResults(results);
  log.info("отчёт отправлен", {
    applied: report.applied.length,
    ignored: report.ignored.length,
  });
  return { processed: results.length };
}

export async function run(args: string[]) {
  const dryRun = args.includes("--dry-run");
  const once = args.includes("--once");

  if (once) {
    await runOnce({ dryRun });
    return;
  }

  log.info("воркер запущен", { intervalMs: config.pollIntervalMs, dryRun });
  for (;;) {
    try {
      await runOnce({ dryRun });
    } catch (error) {
      log.error("цикл завершился ошибкой", { error: String(error) });
    }
    await pause(config.pollIntervalMs);
  }
}
