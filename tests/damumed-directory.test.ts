import { describe, expect, it } from "vitest";
import { damumedDirectorySnapshotSchema } from "@/lib/validation/damumed-browser";

const tenantId = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
const base = {
  tenantId,
  scheduleDate: "2026-08-12",
  observedAt: "2026-08-12T09:00:00+05:00",
  sourceUrl: "https://reg-ala.dmed.kz/Home/Desktop",
  doctors: [
    {
      externalId: "schedule:istileu-a-b",
      name: "Ізтілеу Айнұр Белесқызы",
      specialty: "Акушер-гинеколог",
      room: "Кабинет гинеколога",
      slots: [
        { startsAt: "2026-08-12T09:30:00+05:00", endsAt: "2026-08-12T09:45:00+05:00", status: "available" },
      ],
    },
  ],
};

describe("DAMUMED directory snapshots", () => {
  it("accepts a PHI-free doctor and slot snapshot", () => {
    expect(damumedDirectorySnapshotSchema.parse(base).doctors[0].specialty).toBe("Акушер-гинеколог");
  });

  it("rejects patient fields and foreign hosts", () => {
    expect(damumedDirectorySnapshotSchema.safeParse({ ...base, patientName: "Не должен передаваться" }).success).toBe(false);
    expect(damumedDirectorySnapshotSchema.safeParse({ ...base, sourceUrl: "https://example.com" }).success).toBe(false);
  });

  it("rejects duplicate doctors and invalid intervals", () => {
    expect(damumedDirectorySnapshotSchema.safeParse({ ...base, doctors: [...base.doctors, base.doctors[0]] }).success).toBe(false);
    expect(damumedDirectorySnapshotSchema.safeParse({ ...base, doctors: [{ ...base.doctors[0], slots: [{ startsAt: "2026-08-12T10:00:00+05:00", endsAt: "2026-08-12T09:45:00+05:00", status: "available" }] }] }).success).toBe(false);
  });
});
