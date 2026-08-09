import { afterEach, describe, expect, it } from "vitest";
import {
  offerTtlMinutes,
  searchDays,
  selectOfferSlot,
} from "@/lib/scheduling/matching";
import {
  noShowGraceMinutes,
  noShowLookbackDays,
} from "@/lib/scheduling/no-show";

const now = Date.parse("2026-05-10T06:00:00.000Z");
const hour = 3_600_000;

function slot(offsetHours: number, durationMinutes = 30) {
  return {
    startsAt: new Date(now + offsetHours * hour).toISOString(),
    durationMinutes,
  };
}

afterEach(() => {
  delete process.env.WAITLIST_OFFER_TTL_MINUTES;
  delete process.env.NO_SHOW_GRACE_MINUTES;
});

describe("подбор слота из листа ожидания", () => {
  it("берёт ближайший слот за пределами буфера на дорогу", () => {
    const chosen = selectOfferSlot(
      [slot(1), slot(4)],
      { preferredFrom: null, preferredTo: null },
      { now },
    );
    expect(chosen?.startsAt).toBe(slot(4).startsAt);
  });

  it("уважает окно пациента с обеих сторон", () => {
    const window = {
      preferredFrom: new Date(now + 24 * hour).toISOString(),
      preferredTo: new Date(now + 48 * hour).toISOString(),
    };
    expect(selectOfferSlot([slot(4)], window, { now })).toBeNull();
    expect(selectOfferSlot([slot(72)], window, { now })).toBeNull();
    expect(selectOfferSlot([slot(30)], window, { now })?.startsAt).toBe(
      slot(30).startsAt,
    );
  });

  it("не предлагает один и тот же слот двум пациентам в одном прогоне", () => {
    const taken = new Set<string>();
    const window = { preferredFrom: null, preferredTo: null };
    const first = selectOfferSlot([slot(4), slot(5)], window, {
      now,
      taken,
      doctorId: "doc-1",
    });
    const second = selectOfferSlot([slot(4), slot(5)], window, {
      now,
      taken,
      doctorId: "doc-1",
    });
    expect(first?.startsAt).toBe(slot(4).startsAt);
    expect(second?.startsAt).toBe(slot(5).startsAt);
  });

  it("тот же слот у другого врача остаётся доступным", () => {
    const taken = new Set<string>();
    const window = { preferredFrom: null, preferredTo: null };
    selectOfferSlot([slot(4)], window, { now, taken, doctorId: "doc-1" });
    const other = selectOfferSlot([slot(4)], window, {
      now,
      taken,
      doctorId: "doc-2",
    });
    expect(other?.startsAt).toBe(slot(4).startsAt);
  });

  it("пропускает слот с испорченной датой", () => {
    const chosen = selectOfferSlot(
      [{ startsAt: "не дата", durationMinutes: 30 }, slot(4)],
      { preferredFrom: null, preferredTo: null },
      { now },
    );
    expect(chosen?.startsAt).toBe(slot(4).startsAt);
  });

  it("ограничивает горизонт поиска окном пациента", () => {
    expect(searchDays({ preferredFrom: null, preferredTo: null }, now)).toBe(7);
    expect(
      searchDays(
        {
          preferredFrom: null,
          preferredTo: new Date(now + 3 * 24 * hour).toISOString(),
        },
        now,
      ),
    ).toBe(3);
    expect(
      searchDays(
        {
          preferredFrom: null,
          preferredTo: new Date(now + 90 * 24 * hour).toISOString(),
        },
        now,
      ),
    ).toBe(14);
    expect(
      searchDays(
        {
          preferredFrom: null,
          preferredTo: new Date(now - hour).toISOString(),
        },
        now,
      ),
    ).toBe(1);
  });

  it("срок жизни предложения настраивается в разумных границах", () => {
    expect(offerTtlMinutes()).toBe(120);
    process.env.WAITLIST_OFFER_TTL_MINUTES = "45";
    expect(offerTtlMinutes()).toBe(45);
    process.env.WAITLIST_OFFER_TTL_MINUTES = "2";
    expect(offerTtlMinutes()).toBe(120);
    process.env.WAITLIST_OFFER_TTL_MINUTES = "нет";
    expect(offerTtlMinutes()).toBe(120);
  });
});

describe("параметры воркера no-show", () => {
  it("держит буфер на опоздание в разумных границах", () => {
    expect(noShowGraceMinutes()).toBe(30);
    process.env.NO_SHOW_GRACE_MINUTES = "60";
    expect(noShowGraceMinutes()).toBe(60);
    process.env.NO_SHOW_GRACE_MINUTES = "1";
    expect(noShowGraceMinutes()).toBe(30);
    process.env.NO_SHOW_GRACE_MINUTES = "999";
    expect(noShowGraceMinutes()).toBe(30);
  });

  it("не переписывает историю старше недели", () => {
    expect(noShowLookbackDays).toBe(7);
  });
});
