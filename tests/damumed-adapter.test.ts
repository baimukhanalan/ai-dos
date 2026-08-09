import { describe, expect, it } from "vitest";
import {
  DamuMedAdapter,
  getMedicalAdapter,
  SandboxMedicalInformationSystemAdapter,
} from "@/lib/integrations/medical-information-system";

describe("medical information system adapters", () => {
  it("uses the sandbox adapter until explicitly configured", () => {
    expect(getMedicalAdapter("sandbox")).toBeInstanceOf(
      SandboxMedicalInformationSystemAdapter,
    );
  });

  it("fails closed when DAMUMED official API is not configured", async () => {
    const adapter = new DamuMedAdapter();
    await expect(
      adapter.listServices({ tenantId: crypto.randomUUID() }),
    ).rejects.toMatchObject({
      code: "integration_unavailable",
      status: 503,
    });
  });
});
