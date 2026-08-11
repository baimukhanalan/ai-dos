import type { Locator, Page } from "playwright";
import { config } from "./config.js";
import { log } from "./log.js";
import { pause } from "./session.js";
import { LABELS, slotBlock } from "./ui.js";
import {
  doctorMatchesLabel,
  parseScheduleCell,
  type ScheduleRow,
} from "./text.js";

export class ScheduleNotFoundError extends Error {
  constructor(doctorName: string, date: string) {
    super(`График врача не найден в DamuMed: ${doctorName} на ${date}`);
    this.name = "ScheduleNotFoundError";
  }
}

export class SlotUnavailableError extends Error {
  constructor(timeLabel: string) {
    super(`Слот ${timeLabel} недоступен: занят или отсутствует в сетке`);
    this.name = "SlotUnavailableError";
  }
}

/**
 * Открывает раздел записи и выставляет нужную дату. Поле даты опознаём по
 * уже стоящему в нём значению вида 12.08.2026 — это надёжнее, чем id,
 * который генерируется фреймворком.
 */
export async function openBookingSection(page: Page, date: string) {
  await page.getByText(LABELS.menuBooking, { exact: false }).first().click();
  await pause(config.actionDelayMs * 2);

  for (const candidate of await page.locator("input").all()) {
    const value = await candidate.inputValue().catch(() => "");
    if (!/^\d{2}\.\d{2}\.\d{4}$/.test(value)) continue;
    if (value === date) return;
    await candidate.fill(date);
    await candidate.press("Enter");
    await pause(config.actionDelayMs * 3);
    return;
  }

  throw new Error("Поле даты не найдено на странице записи — проверьте npm run discover");
}

async function rowsOnPage(page: Page): Promise<Array<{ row: Locator; parsed: ScheduleRow }>> {
  const rows = await page.locator("tr").all();
  const parsed: Array<{ row: Locator; parsed: ScheduleRow }> = [];
  for (const row of rows) {
    const cells = await row.locator("td").allInnerTexts();
    if (cells.length < 2) continue;
    const [title, ...rest] = cells;
    if (!title?.trim()) continue;
    parsed.push({ row, parsed: parseScheduleCell(title, rest.join(" ")) });
  }
  return parsed;
}

/** Следующая страница списка графиков; false — страницы закончились. */
async function goToNextPage(page: Page) {
  const next = page.locator('a[title="Перейти на следующую страницу"], .t-arrow-next').first();
  if (!(await next.count())) return false;
  const disabled = await next.getAttribute("class");
  if (disabled && /disabled/i.test(disabled)) return false;
  await next.click().catch(() => undefined);
  await pause(config.actionDelayMs * 2);
  return true;
}

/**
 * Ищет график врача по всем страницам списка: в поликлинике их шесть десятков,
 * и нужный кабинет часто оказывается не на первой.
 */
export async function findSchedule(page: Page, doctorName: string, date: string) {
  for (let pageIndex = 0; pageIndex < 20; pageIndex += 1) {
    for (const item of await rowsOnPage(page)) {
      if (!doctorMatchesLabel(doctorName, item.parsed.title)) continue;
      log.info("график найден", { title: item.parsed.title, free: item.parsed.free });
      return item;
    }
    if (!(await goToNextPage(page))) break;
  }
  throw new ScheduleNotFoundError(doctorName, date);
}

/** Открывает дневную сетку слотов выбранного графика. */
export async function openScheduleDay(page: Page, row: Locator) {
  const freeLink = row.getByText(LABELS.freeCellPrefix, { exact: false }).first();
  if (await freeLink.count()) {
    await freeLink.click();
  } else {
    await row.click();
  }
  await pause(config.actionDelayMs * 3);
}

/**
 * Свободный слот отличается от занятого тем, что в нём нет ни пациента, ни
 * кнопок «Талон» и «Отменить». Проверяем это до клика: иначе воркер открыл бы
 * карточку чужой записи.
 */
export async function openFreeSlot(page: Page, timeLabel: string) {
  const block = slotBlock(page, timeLabel);
  if (!(await block.count())) throw new SlotUnavailableError(timeLabel);

  const text = (await block.innerText().catch(() => "")) || "";
  if (text.includes(LABELS.ticket) || text.includes("Контакты")) {
    throw new SlotUnavailableError(timeLabel);
  }

  await block.click();
  await pause(config.actionDelayMs * 2);
  return block;
}

export type ParsedSlot = { time: string; busy: boolean; text: string };

/**
 * Разбор дневной сетки — это и есть «парсер» свободного времени. Идём по DOM
 * внутри страницы: подпись времени ищем точным совпадением, а состояние слота
 * берём из его блока целиком.
 */
export async function parseDaySlots(page: Page): Promise<ParsedSlot[]> {
  return page.evaluate((busyMarker) => {
    const pattern = /^\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}$/;
    const seen = new Set<string>();
    const slots: Array<{ time: string; busy: boolean; text: string }> = [];

    for (const element of Array.from(document.querySelectorAll<HTMLElement>("div, td, span"))) {
      const own = Array.from(element.childNodes)
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => (node.textContent || "").trim())
        .join(" ")
        .trim();
      if (!pattern.test(own)) continue;

      const time = own.replace(/\s+/g, "");
      if (seen.has(time)) continue;
      seen.add(time);

      const container = element.closest<HTMLElement>("div, td") || element;
      const text = (container.innerText || "").trim();
      slots.push({ time, busy: text.includes(busyMarker), text });
    }

    return slots;
  }, LABELS.ticket);
}
