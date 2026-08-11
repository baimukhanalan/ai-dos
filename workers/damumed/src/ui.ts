import type { Locator, Page } from "playwright";

/**
 * Единственное место, где живёт привязка к интерфейсу МИС. Опора — видимые
 * русские подписи, а не сгенерированные id: подписи меняются реже, а когда
 * поменяются — правка здесь, а не по всему коду.
 *
 * Проверить и поправить их помогает `npm run discover`: он выгружает реальную
 * структуру страницы рядом со стоящими подписями.
 */
export const LABELS = {
  patientSearch: "Поиск пациента",
  searchInRpn: "Искать в РПН",
  menuBooking: "ЗАПИСЬ НА ПРИЕМ",
  searchButton: "ПОИСК",
  clearButton: "ОЧИСТИТЬ",
  dayTab: "День",
  weekTab: "Неделя",
  scheduleGridHeader: "Наименование графика",
  freeCellPrefix: "Свободно",
  backToSchedules: "Вернуться к графикам",
  modeBooking: "Запись на прием",
  modeReserve: "Бронирование",
  showAll: "Показывать все",
  paymentType: "Тип оплаты:",
  reason: "Повод обращения:",
  placeOfService: "Место оказания:",
  service: "Услуга:",
  placeOfVisit: "Место приема:",
  repeatVisit: "Повторный прием",
  save: "Сохранить",
  cancel: "Отменить",
  getConsent: "Получить согласие",
  ticket: "Талон",
  logout: "Выход",
} as const;

function escapeXpath(value: string) {
  if (!value.includes("'")) return `'${value}'`;
  return `concat('${value.split("'").join(`', "'", '`)}')`;
}

/**
 * Форма свёрстана таблицей: подпись в одной ячейке, поле — в соседней.
 * Поэтому берём первый элемент нужного типа, который идёт после подписи.
 */
export function afterLabel(page: Page, label: string, tag: "input" | "select" | "textarea") {
  return page.locator(
    `xpath=(//*[normalize-space(text())=${escapeXpath(label)}]/following::${tag})[1]`,
  );
}

/** Строка сетки слотов, которая начинается с подписи времени «09:00-09:15». */
export function slotBlock(page: Page, timeLabel: string) {
  return page
    .locator(
      `xpath=(//*[normalize-space(text())=${escapeXpath(timeLabel)}]/ancestor::*[self::div or self::td][1])`,
    )
    .first();
}

/** Строка списка графиков по названию врача или кабинета. */
export function scheduleRow(page: Page, title: string) {
  return page
    .locator(`xpath=(//tr[.//text()[contains(., ${escapeXpath(title)})]])[1]`)
    .first();
}

export async function clickByText(page: Page, text: string, exact = false) {
  const target = page.getByText(text, { exact });
  await target.first().click();
}

/**
 * Выпадающий список бывает и обычным `<select>`, и виджетом с подсказками.
 * Пробуем оба пути, чтобы смена компонента не роняла воркер целиком.
 */
export async function chooseOption(page: Page, label: string, value: string, timeout: number) {
  const select = afterLabel(page, label, "select");
  if (await select.count()) {
    try {
      await select.selectOption({ label: value }, { timeout });
      return "select" as const;
    } catch {
      // Виджет только выглядит как select — идём по пути с подсказками.
    }
  }

  const input = afterLabel(page, label, "input");
  await input.click({ timeout });
  await input.fill("");
  await input.type(value, { delay: 40 });
  const suggestion = page.getByText(value, { exact: false }).last();
  await suggestion.waitFor({ state: "visible", timeout });
  await suggestion.click();
  return "autocomplete" as const;
}

/** Значение поля вместе с подсказкой рядом — для отчётов discover. */
export async function describeField(locator: Locator) {
  return locator.evaluate((element) => {
    const node = element as HTMLInputElement;
    return {
      tag: node.tagName.toLowerCase(),
      type: node.type || null,
      id: node.id || null,
      name: node.name || null,
      className: node.className || null,
      value: node.value ?? null,
    };
  });
}
