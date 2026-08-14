import { describe, expect, it } from "vitest";
import { maskPatientPhone, safeTimelineText, sortTimeline } from "@/lib/patient-360";
import { consentSchema } from "@/lib/validation/patient-360";

describe("patient 360 privacy and consent", () => {
  it("masks patient phone and identifiers in timeline excerpts", () => {
    expect(maskPatientPhone("+7 700 123 45 67")).toBe("+7 ••• ••• 67");
    const text = safeTimelineText("ИИН 900101300123, телефон +7 700 123 45 67");
    expect(text).not.toContain("900101300123");
    expect(text).not.toContain("700 123 45 67");
  });

  it("keeps marketing and service-related consent purposes separate", () => {
    expect(consentSchema.parse({ purpose: "data_processing", status: "granted" }).purpose).toBe("data_processing");
    expect(consentSchema.parse({ purpose: "marketing_campaign", status: "withdrawn" }).purpose).toBe("marketing_campaign");
  });

  it("rejects unknown consent purposes and sorts newest events first", () => {
    expect(() => consentSchema.parse({ purpose: "all_services_and_marketing", status: "granted" })).toThrow();
    const events = sortTimeline([
      { id: "1", type: "call", timestamp: "2026-08-13T10:00:00.000Z", channel: "phone", status: "completed", title: "old", detail: null, actor: "AI", branch: null, appointmentId: null, externalReference: null },
      { id: "2", type: "task", timestamp: "2026-08-14T10:00:00.000Z", channel: "portal", status: "open", title: "new", detail: null, actor: "Admin", branch: null, appointmentId: null, externalReference: null },
    ]);
    expect(events.map((item) => item.id)).toEqual(["2", "1"]);
  });
});
