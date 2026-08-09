import { describe, expect, it } from "vitest";
import {
  conversionRate,
  formatKztShort,
  totalLost,
} from "@/lib/analytics/revenue";

describe("аналитика выручки", () => {
  it("конверсия — доля записей от диалогов, не больше единицы", () => {
    expect(conversionRate({ conversations: 100, bookingIntents: 40, bookings: 30, completed: 20 })).toBeCloseTo(0.3);
    expect(conversionRate({ conversations: 0, bookingIntents: 0, bookings: 0, completed: 0 })).toBe(0);
    expect(conversionRate({ conversations: 5, bookingIntents: 9, bookings: 9, completed: 9 })).toBe(1);
  });

  it("сумма потерь складывает только положительные оценки", () => {
    expect(
      totalLost([
        { key: "no_show", count: 3, estimatedKzt: 30000 },
        { key: "cancelled", count: 1, estimatedKzt: 0 },
      ]),
    ).toBe(30000);
  });

  it("крупные суммы форматируются в миллионы и тысячи", () => {
    expect(formatKztShort(18_700_000)).toContain("млн");
    expect(formatKztShort(430_000)).toContain("тыс");
    expect(formatKztShort(500)).toContain("₸");
  });
});
