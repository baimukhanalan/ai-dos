/**
 * Чистые помощники разбора: ФИО, даты, строки расписания. Живут отдельно от
 * браузера, поэтому покрываются тестами без запуска Playwright — а именно
 * здесь ломается интеграция, когда в МИС меняют формат подписи.
 */

/** Пробелы, регистр и «ё» приводим к одному виду; знаки убираем. */
export function normalizeText(value: string) {
  return value
    .normalize("NFC")
    .toLocaleLowerCase("ru-KZ")
    .replace(/ё/g, "е")
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * В карточке пациента ФИО написано полностью, а в названии графика — фамилия
 * с инициалами: «ІЗТІЛЕУ АЙНУР БЕЛЕСҚЫЗЫ» → «ІЗТІЛЕУ А.Б.».
 */
export function shortenFullName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  const [surname, ...rest] = parts;
  const initials = rest
    .slice(0, 2)
    .map((part) => `${part[0].toLocaleUpperCase("ru-KZ")}.`)
    .join("");
  return initials ? `${surname} ${initials}` : surname;
}

export function surnameOf(fullName: string) {
  return normalizeText(fullName).split(" ")[0] || "";
}

/**
 * Совпадает ли врач из очереди с названием графика в МИС. Требуем фамилию и,
 * если в подписи есть инициалы, совпадение первых букв имени и отчества —
 * иначе однофамильцы уводили бы запись к другому врачу.
 */
export function doctorMatchesLabel(doctorFullName: string, label: string) {
  const surname = surnameOf(doctorFullName);
  if (surname.length < 3) return false;
  const normalizedLabel = normalizeText(label);
  if (!normalizedLabel.includes(surname)) return false;

  const parts = normalizeText(doctorFullName).split(" ").slice(1, 3);
  const initials = parts.map((part) => part[0]).filter(Boolean);
  if (!initials.length) return true;

  // «ізділеу а б кабинет гинеколога» — инициалы идут сразу за фамилией.
  const tail = normalizedLabel.slice(normalizedLabel.indexOf(surname) + surname.length);
  const tailInitials = tail.trim().split(" ").slice(0, initials.length);
  if (tailInitials.length < initials.length) return true;
  return initials.every(
    (initial, index) => (tailInitials[index] || "").startsWith(initial),
  );
}

function formatter(timeZone: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("ru-RU", { timeZone, ...options });
}

/** Дата в поле поиска графиков: 12.08.2026. */
export function clinicDate(iso: string, timeZone: string) {
  return formatter(timeZone, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
}

/** Время в сетке слотов: 09:00. */
export function clinicTime(iso: string, timeZone: string) {
  return formatter(timeZone, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

/** Подпись слота, как она напечатана в сетке: 09:00-09:15. */
export function slotLabel(startIso: string, endIso: string, timeZone: string) {
  return `${clinicTime(startIso, timeZone)}-${clinicTime(endIso, timeZone)}`;
}

/** «Свободно: 11» → 11. Нет числа — считаем, что мест нет. */
export function parseFreeCount(text: string) {
  const match = text.match(/(\d+)/);
  return match ? Number(match[1]) : 0;
}

export type ScheduleRow = {
  title: string;
  worksFrom: string | null;
  worksTo: string | null;
  free: number;
};

/**
 * Ячейка дня выглядит как «08:00 - 17:00 Свободно: 32» — из неё нужны рабочее
 * окно и число свободных мест.
 */
export function parseScheduleCell(title: string, cell: string): ScheduleRow {
  const hours = cell.match(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/);
  const free = /свободно/i.test(cell) ? parseFreeCount(cell.split(/свободно/i)[1] || "") : 0;
  return {
    title: title.replace(/\s+/g, " ").trim(),
    worksFrom: hours?.[1] ?? null,
    worksTo: hours?.[2] ?? null,
    free,
  };
}

/**
 * DamuMed не показывает идентификатор записи в интерфейсе, поэтому внешним
 * ключом служит координата слота: график, дата и время. По ней запись можно
 * найти заново и перечитать — это и требуется контракту.
 */
export function externalKey(scheduleTitle: string, startIso: string, timeZone: string) {
  const compact = scheduleTitle.replace(/\s+/g, " ").trim();
  return `damumed:${compact}|${clinicDate(startIso, timeZone)} ${clinicTime(startIso, timeZone)}`;
}

/** Совпало ли ФИО пациента в занятом слоте с тем, кого мы записывали. */
export function patientMatches(expectedFullName: string, slotText: string) {
  const expected = normalizeText(expectedFullName);
  const actual = normalizeText(slotText);
  if (actual.includes(expected)) return true;
  // МИС может печатать «Фамилия Имя» без отчества.
  const parts = expected.split(" ");
  if (parts.length < 2) return false;
  return actual.includes(`${parts[0]} ${parts[1]}`);
}
