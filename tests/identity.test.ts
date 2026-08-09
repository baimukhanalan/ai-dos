import { describe, expect, it } from "vitest";
import {
  identityDecision,
  identityPrompt,
  requiresIdentity,
} from "@/lib/ai/identity";

describe("подтверждение личности пациента", () => {
  it("чувствительные intent требуют подтверждения", () => {
    expect(requiresIdentity("results")).toBe(true);
    expect(requiresIdentity("reschedule")).toBe(true);
    expect(requiresIdentity("cancel")).toBe(true);
    expect(requiresIdentity("appointment_info")).toBe(true);
    expect(requiresIdentity("price")).toBe(false);
    expect(requiresIdentity("book")).toBe(false);
  });

  it("одного имени недостаточно — нужен телефон плюс фактор", () => {
    expect(identityDecision({ fullName: "Айгуль Смагулова" }).canAttempt).toBe(false);
    expect(identityDecision({ phone: "+77001234567" }).canAttempt).toBe(false);
    expect(identityDecision({ phone: "+77001234567", fullName: "Айгуль" }).canAttempt).toBe(true);
    expect(identityDecision({ phone: "+77001234567", birthDate: "1990-05-12" }).canAttempt).toBe(true);
  });

  it("сообщает, каких факторов не хватает", () => {
    const d = identityDecision({ fullName: "Айгуль" });
    expect(d.missing).toContain("phone");
  });

  it("подсказка о подтверждении есть на трёх языках", () => {
    for (const lang of ["ru", "kk", "en"] as const) {
      expect(identityPrompt(lang).length).toBeGreaterThan(20);
    }
  });
});
