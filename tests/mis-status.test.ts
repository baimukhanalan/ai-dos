import { describe, expect, it } from "vitest";
import {
  misIntegrationLabel,
  misIntegrationStatus,
} from "@/lib/integrations/mis-status";

describe("MIS integration status", () => {
  it("keeps sandbox honest by default", () => {
    expect(misIntegrationStatus(undefined, undefined, undefined)).toBe("sandbox");
  });

  it("does not call a remote bridge ready without both credentials", () => {
    expect(misIntegrationStatus("remote", "secret", undefined)).toBe(
      "approved_bridge_setup_required",
    );
  });

  it("marks a fully bound approved bridge ready", () => {
    const status = misIntegrationStatus(
      "remote",
      "secret",
      "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    );
    expect(status).toBe("approved_bridge_ready");
    expect(misIntegrationLabel(status)).toContain("подключён");
  });

  it("distinguishes the official API placeholder", () => {
    expect(misIntegrationStatus("damumed", undefined, undefined)).toBe(
      "official_api_pending",
    );
  });
});
