import { describe, expect, it } from "vitest";
import { summarizeVoiceTranscript } from "@/lib/voice/summary";

describe("voice transcript summary", () => {
  it("creates a booking next step and masks identifiers", () => {
    const result = summarizeVoiceTranscript([
      {
        role: "patient",
        text: "Запишите меня к врачу, телефон +7 700 123 45 67, ИИН 900101300123",
        at: "2026-08-14T05:00:00.000Z",
      },
      {
        role: "assistant",
        text: "Подберу врача и время.",
        at: "2026-08-14T05:00:02.000Z",
      },
    ]);

    expect(result.summary).toContain("Запрос пациента");
    expect(result.summary).not.toContain("900101300123");
    expect(result.summary).not.toContain("77001234567");
    expect(result.summary).toContain("••••0123");
    expect(result.nextAction).toContain("запись");
  });

  it("handles an empty patient side without inventing an outcome", () => {
    const result = summarizeVoiceTranscript([
      {
        role: "assistant",
        text: "Здравствуйте!",
        at: "2026-08-14T05:00:00.000Z",
      },
    ]);
    expect(result.summary).toContain("не успел сформулировать");
  });
});
