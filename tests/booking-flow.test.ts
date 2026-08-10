import { describe, expect, it } from "vitest";
import {
  advanceBooking,
  bookedTurn,
  detectLostSignal,
  initialBookingState,
  matchDoctor,
  parseConfirmation,
  parseSlotChoice,
  slotTakenTurn,
  type BookingContext,
  type BookingState,
  type DoctorOption,
  type OfferedSlot,
} from "@/lib/booking/flow";

const timeZone = "Asia/Almaty";

const doctors: DoctorOption[] = [
  { id: "11111111-1111-1111-1111-111111111111", name: "Айгуль Сериковна Нурланова", specialty: "Кардиолог" },
  { id: "22222222-2222-2222-2222-222222222222", name: "Дмитрий Ким", specialty: "Невролог" },
];

/** Слоты в UTC, которые в Алматы (UTC+5) дают ровные 09:00, 10:00, 14:30. */
const slots: OfferedSlot[] = [
  { startsAt: "2026-09-01T04:00:00.000Z", durationMinutes: 30 },
  { startsAt: "2026-09-01T05:00:00.000Z", durationMinutes: 30 },
  { startsAt: "2026-09-01T09:30:00.000Z", durationMinutes: 30 },
  { startsAt: "2026-09-02T04:00:00.000Z", durationMinutes: 30 },
  { startsAt: "2026-09-02T05:00:00.000Z", durationMinutes: 30 },
  { startsAt: "2026-09-02T09:30:00.000Z", durationMinutes: 30 },
];

function ctx(message: string, overrides: Partial<BookingContext> = {}): BookingContext {
  return { message, doctors, slots, timeZone, ...overrides };
}

function needSlotState(overrides: Partial<BookingState> = {}): BookingState {
  return {
    ...initialBookingState(),
    stage: "need_slot",
    doctorId: doctors[0].id,
    offeredSlots: slots.slice(0, 3),
    ...overrides,
  };
}

describe("разбор реплик пациента", () => {
  it("врач узнаётся по фамилии и по специальности", () => {
    expect(matchDoctor("хочу к Нурлановой", doctors)?.id).toBe(doctors[0].id);
    expect(matchDoctor("нужен невролог", doctors)?.id).toBe(doctors[1].id);
    expect(matchDoctor("запишите меня", doctors)).toBeNull();
  });

  it("слот выбирается номером, порядковым словом и точным временем", () => {
    const offers = slots.slice(0, 3);
    expect(parseSlotChoice("2", offers, timeZone)?.startsAt).toBe(offers[1].startsAt);
    expect(parseSlotChoice("давайте второй", offers, timeZone)?.startsAt).toBe(offers[1].startsAt);
    expect(parseSlotChoice("в 14:30", offers, timeZone)?.startsAt).toBe(offers[2].startsAt);
    expect(parseSlotChoice("бірінші", offers, timeZone)?.startsAt).toBe(offers[0].startsAt);
  });

  it("время, которого нет в предложенных, не выбирается", () => {
    expect(parseSlotChoice("в 18:00", slots.slice(0, 3), timeZone)).toBeNull();
    expect(parseSlotChoice("посмотрю позже", slots.slice(0, 3), timeZone)).toBeNull();
  });

  it("подтверждение и отказ различаются на трёх языках", () => {
    expect(parseConfirmation("да, записывайте")).toBe("yes");
    expect(parseConfirmation("иә")).toBe("yes");
    expect(parseConfirmation("yes please")).toBe("yes");
    expect(parseConfirmation("нет, не подходит")).toBe("no");
    expect(parseConfirmation("жоқ")).toBe("no");
    expect(parseConfirmation("а сколько это займёт")).toBe("unclear");
  });

  it("отказ по цене и отказ от записи различаются", () => {
    expect(detectLostSignal("это слишком дорого")).toBe("price");
    expect(detectLostSignal("қымбат екен")).toBe("price");
    expect(detectLostSignal("передумал, не надо")).toBe("changed_mind");
    expect(detectLostSignal("во сколько работает клиника")).toBeNull();
  });
});

describe("ход разговорной записи", () => {
  it("врач из первой реплики сразу приводит к показу слотов", () => {
    const turn = advanceBooking(initialBookingState(), ctx("запишите к кардиологу"));
    expect(turn.state.stage).toBe("need_slot");
    expect(turn.state.doctorId).toBe(doctors[0].id);
    expect(turn.state.offeredSlots).toHaveLength(3);
    expect(turn.effect.kind).toBe("none");
  });

  it("без свободных слотов AI не отказывает, а предлагает спросить администратора", () => {
    const turn = advanceBooking(initialBookingState(), ctx("к кардиологу", { slots: [] }));
    expect(turn.state.stage).toBe("urgent_ask");
    expect(turn.effect.kind).toBe("none");
  });

  it("согласие на приём вне графика уходит администратору, а отказ — в лист ожидания", () => {
    const asked = advanceBooking(initialBookingState(), ctx("к кардиологу", { slots: [] }));

    const agreed = advanceBooking(asked.state, ctx("да, попросите", { slots: [] }));
    expect(agreed.state.stage).toBe("awaiting_urgent");
    expect(agreed.effect).toEqual({ kind: "urgent", doctorId: doctors[0].id });

    const refused = advanceBooking(asked.state, ctx("нет, не нужно", { slots: [] }));
    expect(refused.effect).toMatchObject({ kind: "close", outcome: "lost", lostReason: "no_slot" });
  });

  it("пока администратор не ответил, диалог остаётся открытым без новых эффектов", () => {
    const waiting = advanceBooking(
      { ...initialBookingState(), stage: "awaiting_urgent", doctorId: doctors[0].id },
      ctx("ну что там?", { slots: [] }),
    );
    expect(waiting.state.stage).toBe("awaiting_urgent");
    expect(waiting.effect.kind).toBe("none");
  });

  it("нет активных врачей — исход no_doctor", () => {
    const turn = advanceBooking(initialBookingState(), ctx("хочу записаться", { doctors: [], slots: [] }));
    expect(turn.effect).toMatchObject({ kind: "close", outcome: "lost", lostReason: "no_doctor" });
  });

  it("выбор слота ведёт к подтверждению, а подтверждение — к бронированию", () => {
    const chosen = advanceBooking(needSlotState(), ctx("второй"));
    expect(chosen.state.stage).toBe("confirming");
    expect(chosen.state.selectedStartsAt).toBe(slots[1].startsAt);

    const confirmed = advanceBooking(chosen.state, ctx("да"));
    expect(confirmed.effect).toEqual({
      kind: "book",
      doctorId: doctors[0].id,
      startsAt: slots[1].startsAt,
    });
  });

  it("«записан» звучит только после подтверждения системой", () => {
    const chosen = advanceBooking(needSlotState(), ctx("первый"));
    const confirmed = advanceBooking(chosen.state, ctx("да"));
    // Сам движок про успех не сообщает — только просит забронировать.
    expect(confirmed.reply).toBe("");

    const done = bookedTurn(confirmed.state, slots[0].startsAt, timeZone);
    expect(done.state.stage).toBe("done");
    expect(done.effect).toMatchObject({ kind: "close", outcome: "booked", lostReason: null });
  });

  it("цена фиксируется как причина потери прямо в диалоге", () => {
    const turn = advanceBooking(needSlotState(), ctx("а это дорого, не потяну"));
    expect(turn.effect).toMatchObject({ kind: "close", outcome: "lost", lostReason: "price" });
  });

  it("«не надо в 9, давайте в 10» — уточнение времени, а не отказ", () => {
    const turn = advanceBooking(needSlotState(), ctx("не надо в 09:00, давайте в 10:00"));
    expect(turn.state.stage).toBe("confirming");
    expect(turn.state.selectedStartsAt).toBe(slots[1].startsAt);
  });

  it("первый непонятый ответ даёт новую подборку, второй закрывает как wrong_time", () => {
    const first = advanceBooking(needSlotState(), ctx("это всё неудобно"));
    expect(first.state.stage).toBe("need_slot");
    expect(first.state.offeredSlots.map((slot) => slot.startsAt)).toEqual(
      slots.slice(3).map((slot) => slot.startsAt),
    );

    const second = advanceBooking(first.state, ctx("тоже не подходит"));
    expect(second.effect).toMatchObject({ kind: "close", outcome: "lost", lostReason: "wrong_time" });
  });

  it("экстренная жалоба прерывает запись и уходит человеку", () => {
    const turn = advanceBooking(needSlotState(), ctx("у меня сильная боль в груди"));
    expect(turn.effect).toMatchObject({ kind: "close", outcome: "escalated", lostReason: null });
    expect(turn.reply).toContain("103");
  });

  it("просьба о человеке закрывается как escalated, а не как потеря", () => {
    const turn = advanceBooking(needSlotState(), ctx("соедините с оператором"));
    expect(turn.effect).toMatchObject({ kind: "close", outcome: "escalated", lostReason: null });
  });

  it("неузнанный врач переспрашивается один раз, потом уходит человеку", () => {
    const first = advanceBooking(initialBookingState(), ctx("мне бы к хорошему специалисту"));
    expect(first.state.stage).toBe("need_doctor");
    expect(first.reply).toContain("Дмитрий Ким");

    const second = advanceBooking(first.state, ctx("ну не знаю"));
    expect(second.effect).toMatchObject({ kind: "close", outcome: "escalated" });
  });

  it("занятый слот не выдаётся за успех: предлагаем оставшиеся", () => {
    const turn = slotTakenTurn(needSlotState({ stage: "confirming" }), slots.slice(3), timeZone);
    expect(turn.state.stage).toBe("need_slot");
    expect(turn.effect.kind).toBe("none");
    expect(turn.reply).toContain("заняли");
  });

  it("язык диалога переключается на казахский и держится", () => {
    const turn = advanceBooking(initialBookingState(), ctx("кардиологқа жазылғым келеді"));
    expect(turn.state.language).toBe("kk");
    const next = advanceBooking(turn.state, ctx("1"));
    expect(next.state.language).toBe("kk");
    expect(next.reply).toContain("Жазылуды растаңыз");
  });

  it("закрытая сессия не бронирует повторно", () => {
    const turn = advanceBooking({ ...needSlotState(), stage: "done" }, ctx("да"));
    expect(turn.effect.kind).toBe("none");
  });
});
