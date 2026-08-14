import { describe, expect, it } from "vitest";
import { doctorAvailabilitySchema } from "@/lib/validation/doctor";
import {
  acceptStaffInvitationSchema,
  staffInvitationSchema,
} from "@/lib/validation/staff";

const id = "11111111-1111-4111-8111-111111111111";

describe("staff and doctor access validation", () => {
  it("requires a clinic doctor profile for doctor invitations", () => {
    expect(
      staffInvitationSchema.safeParse({
        fullName: "Жанна Дуйсенбаева",
        email: "doctor@example.kz",
        role: "doctor",
        idempotencyKey: id,
      }).success,
    ).toBe(false);
    expect(
      staffInvitationSchema.safeParse({
        fullName: "Жанна Дуйсенбаева",
        email: "doctor@example.kz",
        role: "doctor",
        doctorId: id,
        idempotencyKey: id,
      }).success,
    ).toBe(true);
  });

  it("does not allow an operator invitation to carry a doctor identity", () => {
    expect(
      staffInvitationSchema.safeParse({
        fullName: "Регистратор",
        email: "operator@example.kz",
        role: "operator",
        doctorId: id,
        idempotencyKey: id,
      }).success,
    ).toBe(false);
  });

  it("requires strong password and an opaque invite token", () => {
    expect(
      acceptStaffInvitationSchema.safeParse({
        token: "a".repeat(43),
        password: "SecureAccess2026",
      }).success,
    ).toBe(true);
    expect(
      acceptStaffInvitationSchema.safeParse({
        token: "short",
        password: "weak",
      }).success,
    ).toBe(false);
  });

  it("accepts full-day vacation without times and rejects reversed intervals", () => {
    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    expect(
      doctorAvailabilitySchema.safeParse({
        kind: "vacation",
        date: futureDate,
        reason: "Ежегодный отпуск",
        idempotencyKey: id,
      }).success,
    ).toBe(true);
    expect(
      doctorAvailabilitySchema.safeParse({
        kind: "extra_slot",
        date: futureDate,
        startsAt: "15:00",
        endsAt: "14:00",
        reason: "Дополнительное окно",
        idempotencyKey: id,
      }).success,
    ).toBe(false);
  });

  it("rejects availability changes in the past", () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    expect(
      doctorAvailabilitySchema.safeParse({
        kind: "vacation",
        date: yesterday,
        reason: "Просроченное изменение",
        idempotencyKey: id,
      }).success,
    ).toBe(false);
  });
});
