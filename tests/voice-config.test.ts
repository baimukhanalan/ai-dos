import { describe, expect, it } from "vitest";
import {
  buildReceptionistInstructions,
  geminiLiveTools,
  realtimeSessionConfig,
} from "@/lib/voice/config";
import {
  geminiLiveSessionSchema,
  phoneNumberSchema,
  voiceSessionSchema,
} from "@/lib/validation/voice";
import { isVerifiedVoicePatient } from "@/lib/voice/patient-context";

describe("voice safety and realtime configuration", () => {
  it("keeps the medical and identity guardrails in the receptionist prompt", () => {
    const prompt = buildReceptionistInstructions({ clinicName: "Тест", language: "auto" });
    expect(prompt).toContain("Не ставь диагноз");
    expect(prompt).toContain("112 или 103");
    expect(prompt).toContain("последние четыре цифры");
    expect(prompt).toContain("казахский, русский, английский");
  });

  it("grounds the voice agent in clinic context and live data tools", () => {
    const prompt = buildReceptionistInstructions({
      clinicName: "Тест",
      language: "ru",
      clinicContext: "Адрес: улица Комарова, 6А",
    });
    const names =
      geminiLiveTools[0]?.functionDeclarations?.map((tool) => tool.name) || [];

    expect(prompt).toContain("улица Комарова, 6А");
    expect(prompt).toContain("search_clinic_knowledge");
    expect(prompt).toContain("следуй полю exactDoctorAnswer");
    expect(prompt).toContain("назови точные дни недели и интервалы времени");
    expect(prompt).toContain("Рабочий график врача не означает наличие свободного слота");
    expect(prompt).toContain("verify_patient_identity");
    expect(names).toContain("search_clinic_knowledge");
    expect(names).toContain("find_available_slots");
    expect(names).toContain("verify_patient_identity");
    expect(names.indexOf("verify_patient_identity")).toBeLessThan(
      names.indexOf("booking_turn"),
    );
    expect(names).toContain("patient_appointment_turn");
    expect(prompt).toContain("Просмотр существующих записей, отмену и перенос");
    expect(names).toContain("create_callback_request");
  });

  it("enables server VAD, interruption and low-latency defaults", () => {
    const session = realtimeSessionConfig({
      clinicName: "Тест",
      language: "auto",
      model: "gpt-realtime-2.1-mini",
      voice: "marin",
      speed: 1,
    });
    expect(session.audio.input.turn_detection.type).toBe("server_vad");
    expect(session.audio.input.turn_detection.interrupt_response).toBe(true);
    expect(session.audio.input.turn_detection.silence_duration_ms).toBeLessThan(500);
    expect(session.model).toBe("gpt-realtime-2.1-mini");
  });

  it("requires explicit recording consent and a supported model", () => {
    expect(voiceSessionSchema.safeParse({ model: "unknown", voice: "marin", language: "ru", speed: 1, recordingConsent: true }).success).toBe(false);
    expect(voiceSessionSchema.safeParse({ model: "gpt-realtime-2.1-mini", voice: "marin", language: "ru", speed: 1, recordingConsent: false }).success).toBe(false);
  });

  it("binds voice mutations to the patient verified in the same session", () => {
    const patientId = "11111111-1111-4111-8111-111111111111";
    expect(isVerifiedVoicePatient(null, patientId)).toBe(false);
    expect(isVerifiedVoicePatient(patientId, undefined)).toBe(true);
    expect(isVerifiedVoicePatient(patientId, undefined, true)).toBe(false);
    expect(isVerifiedVoicePatient(patientId, patientId, true)).toBe(true);
    expect(
      isVerifiedVoicePatient(
        patientId,
        "22222222-2222-4222-8222-222222222222",
        true,
      ),
    ).toBe(false);
  });

  it("accepts Gemini Live voices only with explicit recording consent", () => {
    expect(
      geminiLiveSessionSchema.safeParse({
        voice: "Zephyr",
        language: "auto",
        recordingConsent: true,
      }).success,
    ).toBe(true);
    expect(
      geminiLiveSessionSchema.safeParse({
        voice: "marin",
        language: "ru",
        recordingConsent: true,
      }).success,
    ).toBe(false);
  });

  it("accepts only real E.164 phone number shapes", () => {
    const base = { label: "Основной", provider: "sip", voice: "marin", languages: ["ru", "kk"], active: false };
    expect(phoneNumberSchema.safeParse({ ...base, e164: "+77001234567" }).success).toBe(true);
    expect(phoneNumberSchema.safeParse({ ...base, e164: "87001234567" }).success).toBe(false);
  });
});
