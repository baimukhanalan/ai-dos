import { mkdir, writeFile } from "node:fs/promises";
import { config } from "../config.js";
import { log } from "../log.js";
import { ensureDesktop, openSession, pause, saveArtifacts } from "../session.js";
import { LABELS } from "../ui.js";
import type { Page } from "playwright";

type FieldReport = {
  tag: string;
  type: string | null;
  id: string | null;
  name: string | null;
  className: string | null;
  value: string | null;
  text: string | null;
  label: string | null;
  visible: boolean;
};

/**
 * Выгружает реальную структуру страницы: какие поля есть и какая подпись
 * стоит слева от каждого. Это карта для правки `ui.ts`, когда МИС меняет
 * вёрстку — без неё пришлось бы угадывать селекторы вслепую.
 */
async function dump(page: Page, name: string) {
  const fields = (await page.evaluate(() => {
    function labelOf(element: Element) {
      let node: Node | null = element;
      // Подпись обычно стоит в соседней ячейке таблицы или прямо перед полем.
      while (node) {
        const previous: Node | null = (node as Element).previousElementSibling;
        if (previous) {
          const text = (previous.textContent || "").trim();
          if (text && text.length < 80) return text;
        }
        node = node.parentElement;
        if (node === document.body) break;
      }
      return null;
    }

    return Array.from(
      document.querySelectorAll<HTMLElement>("input, select, textarea, button, a"),
    )
      .slice(0, 400)
      .map((element) => {
        const field = element as HTMLInputElement;
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          type: field.type || null,
          id: element.id || null,
          name: field.name || null,
          className: element.className || null,
          value: typeof field.value === "string" ? field.value.slice(0, 120) : null,
          text: (element.innerText || "").trim().slice(0, 120) || null,
          label: labelOf(element),
          visible: rect.width > 0 && rect.height > 0,
        };
      });
  })) as FieldReport[];

  await mkdir(config.artifactsDir, { recursive: true });
  const jsonPath = `${config.artifactsDir}/discover-${name}.json`;
  await writeFile(jsonPath, JSON.stringify({ url: page.url(), fields }, null, 2), "utf8");

  const readable = fields
    .filter((field) => field.visible)
    .map(
      (field) =>
        `${field.tag}${field.type ? `[${field.type}]` : ""}  подпись: ${field.label || "—"}  id: ${field.id || "—"}  name: ${field.name || "—"}  текст: ${field.text || "—"}`,
    )
    .join("\n");
  await writeFile(`${config.artifactsDir}/discover-${name}.txt`, readable, "utf8");

  await saveArtifacts(page, `discover-${name}`);
  log.info("страница выгружена", { name, url: page.url(), fields: fields.length });
}

export async function discover(args: string[]) {
  const scheduleTitle = args.find((arg) => !arg.startsWith("--"));
  const session = await openSession({ headless: false });
  try {
    await ensureDesktop(session.page);
    await dump(session.page, "desktop");

    await session.page.getByText(LABELS.menuBooking, { exact: false }).first().click();
    await pause(config.actionDelayMs * 3);
    await dump(session.page, "booking-search");

    if (scheduleTitle) {
      await session.page.getByText(scheduleTitle, { exact: false }).first().click();
      await pause(config.actionDelayMs * 4);
      await dump(session.page, "schedule-day");
      log.info(
        "чтобы выгрузить форму записи, кликните свободный слот в открытом окне — выгрузка через 20 секунд",
      );
      await pause(20_000);
      await dump(session.page, "booking-dialog");
    }
  } finally {
    await session.close();
  }
}
