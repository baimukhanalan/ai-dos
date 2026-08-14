import { describe, expect, it } from "vitest";
import { platformTenantStatusSchema } from "@/lib/validation/platform";
import {
  platformPlanLabel,
  platformSubscriptionLabel,
} from "@/lib/platform-labels";

describe("platform tenant controls", () => {
  it.each(["active", "suspended", "archived"])(
    "accepts the supported %s status",
    (status) => {
      expect(platformTenantStatusSchema.parse({ status })).toEqual({ status });
    },
  );

  it("rejects an arbitrary tenant status", () => {
    expect(() =>
      platformTenantStatusSchema.parse({ status: "disabled" }),
    ).toThrow();
  });

  it("presents database fallback values as human labels", () => {
    expect(platformPlanLabel("none")).toBe("Без тарифа");
    expect(platformSubscriptionLabel("missing")).toBe("Нет подписки");
  });
});
