import { describe, expect, it } from "vitest";

import { parsePlatformSettings, platformOperationSchema } from "@/lib/validation/platform-operations";

const tenantId = "11111111-1111-4111-8111-111111111111";

describe("platform operations validation", () => {
  it("accepts audited subscription and limit changes", () => {
    expect(platformOperationSchema.parse({ action: "subscription.update", tenantId, plan: "clinic", status: "active", currentPeriodEnd: "2026-09-01" })).toMatchObject({ plan: "clinic" });
    expect(platformOperationSchema.parse({ action: "limit.update", tenantId, metric: "voice_minutes", limit: 2500 })).toMatchObject({ limit: 2500 });
  });

  it("rejects invalid payment periods and unsafe feature keys", () => {
    expect(() => platformOperationSchema.parse({ action: "payment.create", tenantId, periodStart: "2026-09-01", periodEnd: "2026-08-01", amountKzt: 1000, status: "paid", note: null })).toThrow();
    expect(() => platformOperationSchema.parse({ action: "flag.update", tenantId, key: "DROP TABLE", enabled: true })).toThrow();
  });

  it("keeps safe defaults when global settings are missing or malformed", () => {
    expect(parsePlatformSettings(null)).toEqual({ maintenanceMode: false, supportEmail: null, defaultLocale: "ru-KZ", defaultTimezone: "Asia/Almaty" });
    expect(parsePlatformSettings({ maintenanceMode: true, supportEmail: "ops@ai-dos.kz", defaultLocale: "kk-KZ", defaultTimezone: "Asia/Almaty" })).toMatchObject({ maintenanceMode: true, defaultLocale: "kk-KZ" });
  });
});
