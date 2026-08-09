import { describe, expect, it } from "vitest";
import { getPlan, plans, planUsageState } from "@/lib/billing/plans";
import { usageMetricLabels, usageMetrics } from "@/lib/billing/metrics";
import { parseBranding, brandingStyle, defaultBranding } from "@/lib/branding";
import { brandingSchema, planChangeSchema } from "@/lib/validation/billing";

describe("тарифы и потребление", () => {
  it("неизвестный тариф превращается в пилотный", () => {
    expect(getPlan("enterprise").code).toBe("pilot");
    expect(getPlan(null).code).toBe("pilot");
    expect(getPlan("clinic").code).toBe("clinic");
  });

  it("в каждом тарифе описаны все метрики", () => {
    for (const plan of Object.values(plans)) {
      for (const metric of usageMetrics) {
        expect(plan.limits, plan.code).toHaveProperty(metric);
      }
    }
  });

  it("предупреждает на 80% и фиксирует превышение", () => {
    const state = planUsageState(
      plans.pilot,
      {
        appointments_created: 240,
        notifications_sent: 500,
        voice_minutes: 10,
      },
      usageMetricLabels,
    );
    const byMetric = new Map(state.map((item) => [item.metric, item]));
    expect(byMetric.get("appointments_created")?.state).toBe("warning");
    expect(byMetric.get("notifications_sent")?.state).toBe("exceeded");
    expect(byMetric.get("voice_minutes")?.state).toBe("ok");
    expect(byMetric.get("ai_messages")?.used).toBe(0);
  });

  it("безлимитный тариф не уходит в предупреждение", () => {
    const state = planUsageState(
      plans.network,
      { notifications_sent: 1_000_000 },
      usageMetricLabels,
    );
    expect(state.every((item) => item.state === "ok")).toBe(true);
    expect(state.every((item) => item.ratio === 0)).toBe(true);
  });

  it("доля потребления не превышает единицу", () => {
    const state = planUsageState(
      plans.pilot,
      { appointments_created: 100_000 },
      usageMetricLabels,
    );
    expect(state[0].ratio).toBe(1);
  });

  it("принимает только известные коды тарифов", () => {
    expect(planChangeSchema.safeParse({ plan: "clinic" }).success).toBe(true);
    expect(planChangeSchema.safeParse({ plan: "free" }).success).toBe(false);
  });
});

describe("бренд клиники", () => {
  it("принимает корректные значения", () => {
    const parsed = brandingSchema.parse({
      displayName: "Клиника «Аман»",
      primaryColor: "#0a5b3b",
      logoUrl: "https://clinic.kz/logo.svg",
      supportPhone: "+77001234567",
      locale: "kk",
    });
    expect(parsed.primaryColor).toBe("#0a5b3b");
    expect(parsed.supportEmail).toBeNull();
    expect(parsed.locale).toBe("kk");
  });

  it("отклоняет цвет, который не является строгим hex", () => {
    for (const value of ["red", "#fff", "#0a5b3b; content:url(x)"]) {
      expect(
        brandingSchema.safeParse({ primaryColor: value }).success,
        value,
      ).toBe(false);
    }
  });

  it("не принимает логотип по небезопасной схеме", () => {
    for (const value of [
      "http://clinic.kz/logo.svg",
      "javascript:alert(1)",
      "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
    ]) {
      expect(brandingSchema.safeParse({ logoUrl: value }).success, value).toBe(
        false,
      );
    }
  });

  it("повреждённое значение из БД заменяется дефолтом", () => {
    expect(parseBranding({ primaryColor: "rgb(0,0,0)" })).toEqual(
      defaultBranding,
    );
    expect(parseBranding(null)).toEqual(defaultBranding);
  });

  it("в стиль попадают только заданные цвета", () => {
    expect(brandingStyle(defaultBranding)).toEqual({});
    expect(
      brandingStyle({ ...defaultBranding, primaryColor: "#0a5b3b" }),
    ).toMatchObject({ "--primary": "#0a5b3b" });
  });
});
