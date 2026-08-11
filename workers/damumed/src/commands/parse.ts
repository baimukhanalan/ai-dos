import { mkdir, writeFile } from "node:fs/promises";
import { config } from "../config.js";
import { log } from "../log.js";
import { ensureDesktop, openSession, pause } from "../session.js";
import { openBookingSection, parseDaySlots } from "../schedule.js";
import { clinicDate, parseScheduleCell, type ScheduleRow } from "../text.js";
import { LABELS } from "../ui.js";
import type { Page } from "playwright";

export type ParsedSchedule = ScheduleRow & {
  slots?: Array<{ time: string; busy: boolean }>;
};

async function readPage(page: Page): Promise<ScheduleRow[]> {
  const rows = await page.evaluate(() =>
    Array.from(document.querySelectorAll("tr"))
      .map((row) => Array.from(row.querySelectorAll("td")).map((cell) => (cell as HTMLElement).innerText))
      .filter((cells) => cells.length >= 2 && cells[0].trim().length > 0),
  );
  return rows.map((cells) => parseScheduleCell(cells[0], cells.slice(1).join(" ")));
}

async function nextPage(page: Page) {
  const next = page.locator('a[title="Перейти на следующую страницу"], .t-arrow-next').first();
  if (!(await next.count())) return false;
  const className = (await next.getAttribute("class")) || "";
  if (/disabled/i.test(className)) return false;
  await next.click().catch(() => undefined);
  await pause(config.actionDelayMs * 2);
  return true;
}

/**
 * Снимает расписание клиники на дату: какие графики есть и сколько в каждом
 * свободных мест. Это чтение — оно ничего не меняет в чужой системе.
 */
export async function parse(args: string[]) {
  const dateArg = args.find((arg) => /^\d{2}\.\d{2}\.\d{4}$/.test(arg));
  const withSlots = args.includes("--slots");
  const date = dateArg || clinicDate(new Date().toISOString(), config.timeZone);

  const session = await openSession();
  const collected: ParsedSchedule[] = [];
  try {
    await ensureDesktop(session.page);
    await openBookingSection(session.page, date);

    for (let index = 0; index < 20; index += 1) {
      collected.push(...(await readPage(session.page)));
      if (!(await nextPage(session.page))) break;
    }

    if (withSlots) {
      for (const schedule of collected.filter((item) => item.free > 0)) {
        const row = session.page.getByText(schedule.title, { exact: false }).first();
        if (!(await row.count())) continue;
        await row.click().catch(() => undefined);
        await pause(config.actionDelayMs * 3);
        schedule.slots = (await parseDaySlots(session.page)).map((slot) => ({
          time: slot.time,
          busy: slot.busy,
        }));
        await session.page
          .getByText(LABELS.backToSchedules, { exact: false })
          .first()
          .click()
          .catch(() => undefined);
        await pause(config.actionDelayMs * 3);
      }
    }
  } finally {
    await session.close();
  }

  await mkdir(config.artifactsDir, { recursive: true });
  const path = `${config.artifactsDir}/schedules-${date.replace(/\./g, "-")}.json`;
  await writeFile(path, JSON.stringify({ date, schedules: collected }, null, 2), "utf8");
  log.info("расписание снято", { date, schedules: collected.length, path });
  return collected;
}
