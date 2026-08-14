import { describe, expect, it } from "vitest";
import {
  campaignSafetyChecks,
  channelConsentPurpose,
  isWithinSendWindow,
  planCampaignMoments,
} from "@/lib/campaigns/policy";

describe("campaign policy", () => {
  it("requires purpose-specific channel consent", () => {
    expect(channelConsentPurpose("voice")).toBe("outbound_calls");
    expect(channelConsentPurpose("whatsapp")).toBe("whatsapp");
    expect(channelConsentPurpose("sms")).toBe("messages");
  });

  it("splits contacts across the daily limit and period", () => {
    const moments = planCampaignMoments({
      startsAt: "2026-08-15T04:00:00.000Z",
      count: 7,
      dailyLimit: 2,
      periodDays: 3,
    });
    expect(moments).toHaveLength(6);
    expect(moments[0]).toBe("2026-08-15T04:00:00.000Z");
    expect(moments[2]).toBe("2026-08-16T04:00:00.000Z");
    expect(moments[4]).toBe("2026-08-17T04:00:00.000Z");
  });

  it("checks the local quiet-hours window in the clinic timezone", () => {
    expect(isWithinSendWindow("2026-08-15T05:00:00.000Z", "Asia/Almaty", "09:00", "18:00")).toBe(true);
    expect(isWithinSendWindow("2026-08-15T18:00:00.000Z", "Asia/Almaty", "09:00", "18:00")).toBe(false);
  });

  it("blocks launch when provider, message, or quiet-hours safety is missing", () => {
    const checks = campaignSafetyChecks({
      audience: { total: 10, noConsent: 2, optedOut: 1, frequencyCapped: 1, missingChannel: 1, eligible: 5 },
      providerReady: false,
      messageBody: "short",
      sendWindowStart: "07:00",
      sendWindowEnd: "22:00",
    });
    expect(checks.filter((check) => !check.valid).map((check) => check.code)).toEqual([
      "opt_out_link",
      "quiet_hours",
      "provider",
      "message",
    ]);
  });
});
