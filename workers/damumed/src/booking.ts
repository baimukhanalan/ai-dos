import type { Page } from "playwright";
import { config } from "./config.js";
import { log } from "./log.js";
import { pause } from "./session.js";
import { afterLabel, chooseOption, LABELS, slotBlock } from "./ui.js";
import { patientMatches } from "./text.js";

export class ServiceNotFoundError extends Error {
  constructor(service: string) {
    super(`Услуга не найдена в справочнике DamuMed: ${service}`);
    this.name = "ServiceNotFoundError";
  }
}

export type BookingForm = {
  reason: string;
  serviceName: string | null;
};

/** Диалог «Запись на прием» открыт, если видна подпись «Тип оплаты:». */
export async function dialogOpen(page: Page) {
  return page
    .getByText(LABELS.paymentType, { exact: false })
    .first()
    .isVisible()
    .catch(() => false);
}

/**
 * Заполняет форму записи. Услуга — обязательное поле с автодополнением:
 * набранный текст без выбора подсказки МИС не принимает и подсвечивает поле
 * красным, поэтому подсказку выбираем явно и проверяем результат.
 */
export async function fillBookingForm(page: Page, form: BookingForm) {
  if (!(await dialogOpen(page))) {
    throw new Error("Диалог записи не открылся после клика по слоту");
  }

  await chooseOption(page, LABELS.paymentType, config.form.paymentType, config.stepTimeoutMs).catch(
    (error) => log.warn("тип оплаты оставлен по умолчанию", { error: String(error) }),
  );

  const reason = afterLabel(page, LABELS.reason, "input");
  if (await reason.count()) {
    await reason.fill(form.reason.slice(0, 200));
  }

  await chooseOption(
    page,
    LABELS.placeOfService,
    config.form.placeOfService,
    config.stepTimeoutMs,
  ).catch((error) => log.warn("место оказания оставлено по умолчанию", { error: String(error) }));

  if (form.serviceName) {
    const service = afterLabel(page, LABELS.service, "input");
    await service.click();
    await service.fill("");
    await service.type(form.serviceName, { delay: 40 });
    await pause(config.actionDelayMs * 2);

    const suggestion = page.getByText(form.serviceName, { exact: false }).last();
    const visible = await suggestion
      .waitFor({ state: "visible", timeout: config.stepTimeoutMs })
      .then(() => true)
      .catch(() => false);
    if (!visible) throw new ServiceNotFoundError(form.serviceName);
    await suggestion.click();
    await pause();

    const chosen = await service.inputValue().catch(() => "");
    if (!chosen.trim()) throw new ServiceNotFoundError(form.serviceName);
  }
}

/** Нажимает «Сохранить» и ждёт закрытия диалога. */
export async function submitBookingForm(page: Page) {
  await page.getByRole("button", { name: LABELS.save }).first().click();
  await pause(config.actionDelayMs * 3);

  const stillOpen = await dialogOpen(page);
  if (stillOpen) {
    const body = await page.locator("body").innerText().catch(() => "");
    throw new Error(
      `МИС не приняла форму записи${body.includes(LABELS.service) ? ": проверьте поле «Услуга»" : ""}`,
    );
  }
}

/**
 * Перечитывает слот после сохранения. Без этого шага нельзя отличить
 * «форма отправилась» от «запись действительно появилась у врача» — а именно
 * на этой разнице держится защита от дублей в AI Dos.
 */
export async function verifyBooking(page: Page, timeLabel: string, patientFullName: string) {
  await page.reload({ waitUntil: "domcontentloaded" }).catch(() => undefined);
  await pause(config.actionDelayMs * 3);

  const block = slotBlock(page, timeLabel);
  if (!(await block.count())) return false;
  const text = (await block.innerText().catch(() => "")) || "";
  return patientMatches(patientFullName, text);
}

/** Отмена записи в слоте — используется, когда AI Dos отменил приём. */
export async function cancelBooking(page: Page, timeLabel: string, patientFullName: string) {
  const block = slotBlock(page, timeLabel);
  if (!(await block.count())) return false;
  const text = (await block.innerText().catch(() => "")) || "";
  if (!patientMatches(patientFullName, text)) return false;

  await block.getByRole("button", { name: LABELS.cancel }).first().click();
  await pause(config.actionDelayMs * 3);
  return true;
}
