import { describe, expect, it } from "vitest";
import {
  geminiToolErrorResponse,
  geminiToolSuccessResponse,
} from "@/lib/voice/gemini-tools";

describe("Gemini Live tool responses", () => {
  const call = { id: "call-1", name: "list_doctors" };

  it("returns clinic data in the SDK result field", () => {
    const response = geminiToolSuccessResponse(call, {
      exactDoctorAnswer: "Дуйсенбаева Жанна — Пн 08:00–13:00",
    });
    expect(response).toEqual({
      ...call,
      response: {
        result: {
          exactDoctorAnswer: "Дуйсенбаева Жанна — Пн 08:00–13:00",
        },
      },
    });
    expect(response.response).not.toHaveProperty("output");
  });

  it("returns failures in the same result envelope", () => {
    expect(geminiToolErrorResponse(call, "Временно недоступно")).toEqual({
      ...call,
      response: { result: { error: "Временно недоступно" } },
    });
  });
});
