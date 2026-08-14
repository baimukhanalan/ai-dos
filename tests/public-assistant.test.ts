import { describe, expect, it } from "vitest";
import {
  isCallbackRequest,
  isExplicitBookingRequest,
} from "@/lib/public/routing";
import { publicAssistantRequestSchema } from "@/lib/validation/public-assistant";
import { detectIntent } from "@/lib/ai/escalation";

describe("public patient assistant", () => {
  it("does not force identity for public schedule information", () => {
    expect(isExplicitBookingRequest("Назовите график всех врачей")).toBe(false);
    expect(isExplicitBookingRequest("Покажите свободное время")).toBe(false);
  });

  it("requires the booking path only for explicit requests", () => {
    expect(isExplicitBookingRequest("Запишите меня к врачу")).toBe(true);
    expect(detectIntent("Запишите меня к врачу")).toBe("book");
    expect(isExplicitBookingRequest("I want you to book me an appointment")).toBe(true);
    expect(isExplicitBookingRequest("Дәрігерге жазылғым келеді")).toBe(true);
  });

  it("recognizes callback requests in supported languages", () => {
    expect(isCallbackRequest("Нужен обратный звонок")).toBe(true);
    expect(isCallbackRequest("Кері қоңырау керек")).toBe(true);
    expect(isCallbackRequest("Please request a callback")).toBe(true);
  });

  it("requires phone and a second identity factor", () => {
    expect(
      publicAssistantRequestSchema.safeParse({
        message: "Запишите меня",
        locale: "ru",
        identity: { phone: "+77001234567" },
      }).success,
    ).toBe(false);
    expect(
      publicAssistantRequestSchema.safeParse({
        message: "Запишите меня",
        locale: "ru",
        identity: { phone: "+77001234567", surname: "Иванов" },
      }).success,
    ).toBe(true);
  });

  it("accepts a consented new-patient registration", () => {
    expect(
      publicAssistantRequestSchema.safeParse({
        message: "Запишите меня к врачу",
        locale: "ru",
        registration: {
          fullName: "Тестовый Пациент",
          phone: "+77001234567",
          birthDate: "1990-04-18",
          consent: true,
        },
      }).success,
    ).toBe(true);
  });

  it("rejects registration without consent or with a future birth date", () => {
    const base = {
      message: "Запишите меня к врачу",
      locale: "ru",
      registration: {
        fullName: "Тестовый Пациент",
        phone: "+77001234567",
        birthDate: "2990-04-18",
      },
    };
    expect(publicAssistantRequestSchema.safeParse(base).success).toBe(false);
    expect(
      publicAssistantRequestSchema.safeParse({
        ...base,
        registration: { ...base.registration, consent: true },
      }).success,
    ).toBe(false);
    expect(
      publicAssistantRequestSchema.safeParse({
        ...base,
        registration: {
          ...base.registration,
          phone: "1     2",
          birthDate: "1990-04-18",
          consent: true,
        },
      }).success,
    ).toBe(false);
  });

  it("does not accept identity and registration together", () => {
    expect(
      publicAssistantRequestSchema.safeParse({
        message: "Запишите меня",
        locale: "ru",
        identity: { phone: "+77001234567", surname: "Иванов" },
        registration: {
          fullName: "Тестовый Пациент",
          phone: "+77007654321",
          birthDate: "1990-04-18",
          consent: true,
        },
      }).success,
    ).toBe(false);
  });
});
