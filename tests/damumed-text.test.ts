import { describe, expect, it } from "vitest";
import {
  clinicDate,
  clinicTime,
  doctorMatchesLabel,
  externalKey,
  parseFreeCount,
  parseScheduleCell,
  patientMatches,
  shortenFullName,
  slotLabel,
} from "../workers/damumed/src/text";

const timeZone = "Asia/Almaty";

describe("разбор интерфейса DamuMed", () => {
  it("фамилию с инициалами собираем так же, как их печатает МИС", () => {
    expect(shortenFullName("ІЗТІЛЕУ АЙНУР БЕЛЕСҚЫЗЫ")).toBe("ІЗТІЛЕУ А.Б.");
    expect(shortenFullName("ПАЛМАНОВ САЛАМАТ КУЛАКМЕТОВИЧ")).toBe("ПАЛМАНОВ С.К.");
    expect(shortenFullName("КАМЗИНА")).toBe("КАМЗИНА");
  });

  it("врач находится по названию графика, а однофамилец — нет", () => {
    expect(doctorMatchesLabel("ІЗТІЛЕУ АЙНУР БЕЛЕСҚЫЗЫ", "ІЗТІЛЕУ А.Б. Кабинет гинеколога")).toBe(true);
    expect(
      doctorMatchesLabel("ПАЛМАНОВ САЛАМАТ КУЛАКМЕТОВИЧ", "ПАЛМАНОВ С.К. Кабинет травматолога ортопеда"),
    ).toBe(true);
    // Та же фамилия, другие инициалы — это другой врач.
    expect(doctorMatchesLabel("ПАЛМАНОВ ЕРБОЛ ТУРСЫНОВИЧ", "ПАЛМАНОВ С.К. Кабинет травматолога")).toBe(
      false,
    );
    expect(doctorMatchesLabel("АНУАРБЕКОВА АЙДАНА ТАНИБЕКОВНА", "ЕДИЛБЕКОВА С.Е. Кабинет")).toBe(false);
  });

  it("ячейка дня разбирается на рабочее окно и число свободных мест", () => {
    expect(parseScheduleCell("ІЗТІЛЕУ А.Б. Кабинет гинеколога", "09:00 - 12:00 Свободно: 11")).toEqual({
      title: "ІЗТІЛЕУ А.Б. Кабинет гинеколога",
      worksFrom: "09:00",
      worksTo: "12:00",
      free: 11,
    });
    expect(parseScheduleCell("ХАЛИМАНОВ А.А. Кабинет ЛОР", "08:00 - 17:00 Свободно: 0").free).toBe(0);
    expect(parseScheduleCell("Кабинет", "нет графика").free).toBe(0);
  });

  it("«Свободно: 32» читается как число, а пустая подпись — как ноль мест", () => {
    expect(parseFreeCount("Свободно: 32")).toBe(32);
    expect(parseFreeCount("нет данных")).toBe(0);
  });

  it("время слота считается в часовом поясе клиники, а не сервера", () => {
    // 04:00 UTC — это 09:00 в Алматы.
    expect(clinicTime("2026-08-12T04:00:00.000Z", timeZone)).toBe("09:00");
    expect(clinicDate("2026-08-12T04:00:00.000Z", timeZone)).toBe("12.08.2026");
    expect(slotLabel("2026-08-12T04:00:00.000Z", "2026-08-12T04:15:00.000Z", timeZone)).toBe(
      "09:00-09:15",
    );
    // Поздний вечер по UTC — уже следующий день в клинике.
    expect(clinicDate("2026-08-11T20:00:00.000Z", timeZone)).toBe("12.08.2026");
  });

  it("внешний ключ записи однозначно указывает на слот", () => {
    expect(externalKey("ІЗТІЛЕУ А.Б. Кабинет гинеколога", "2026-08-12T04:00:00.000Z", timeZone)).toBe(
      "damumed:ІЗТІЛЕУ А.Б. Кабинет гинеколога|12.08.2026 09:00",
    );
  });

  it("пациент в занятом слоте сверяется по ФИО, в том числе без отчества", () => {
    const slot = "09:00-09:15 КАМЗИНА БАХЫТЖАН АБДИЛАШИМОВНА 10.08.1995 Консультация";
    expect(patientMatches("КАМЗИНА БАХЫТЖАН АБДИЛАШИМОВНА", slot)).toBe(true);
    expect(patientMatches("КАМЗИНА БАХЫТЖАН", slot)).toBe(true);
    expect(patientMatches("ТАГАБАЙ АЙДАНА КӨБЕЙҚЫЗЫ", slot)).toBe(false);
  });
});
