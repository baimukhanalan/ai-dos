import type { Page } from "playwright";
import { config } from "./config.js";
import { pause } from "./session.js";
import { afterLabel, LABELS } from "./ui.js";
import { patientMatches, clinicDate } from "./text.js";

/** Пациента в МИС не нашли — заводить его вслепую воркер не имеет права. */
export class PatientNotFoundError extends Error {
  constructor(fullName: string) {
    super(`Пациент не найден в DamuMed: ${fullName}`);
    this.name = "PatientNotFoundError";
  }
}

export type PatientQuery = {
  fullName: string;
  birthDate: string | null;
};

/**
 * Выбирает пациента в шапке регистратуры. Все дальнейшие действия МИС
 * относит именно к выбранному пациенту, поэтому подтверждение выбора —
 * обязательный шаг: без него запись ушла бы предыдущему человеку.
 */
export async function selectPatient(page: Page, patient: PatientQuery) {
  const input = afterLabel(page, LABELS.patientSearch, "input");
  await input.click();
  await input.fill("");
  await input.type(patient.fullName, { delay: 30 });
  await pause();
  await page.keyboard.press("Enter");
  await pause(config.actionDelayMs * 2);

  const suggestion = page.getByText(patient.fullName, { exact: false });
  if (await suggestion.count()) {
    await suggestion.first().click().catch(() => undefined);
    await pause();
  }

  if (!(await patientSelected(page, patient))) {
    throw new PatientNotFoundError(patient.fullName);
  }
}

/**
 * Шапка показывает ФИО и дату рождения выбранного пациента — сверяем оба
 * поля. Совпадения одного имени мало: однофамильцы встречаются постоянно.
 */
export async function patientSelected(page: Page, patient: PatientQuery) {
  const header = await page.locator("body").innerText().catch(() => "");
  if (!patientMatches(patient.fullName, header)) return false;
  if (!patient.birthDate) return true;
  return header.includes(clinicDate(`${patient.birthDate}T12:00:00.000Z`, config.timeZone));
}
