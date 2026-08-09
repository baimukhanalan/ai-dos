import { describe, expect, it } from "vitest";
import {
  decideSyncOutcome,
  maxSyncAttempts,
} from "@/lib/integrations/mis-sync";
import {
  DamuMedAdapter,
  SandboxMedicalInformationSystemAdapter,
} from "@/lib/integrations/medical-information-system";

describe("решение о переносе записи в МИС", () => {
  it("подтверждённая и перечитанная запись закрывает синхронизацию", () => {
    const decision = decideSyncOutcome(
      { status: "synced", externalId: "ext-1", verified: true },
      1,
    );
    expect(decision.state).toBe("synced");
    expect(decision.createTask).toBe(false);
    expect(decision.error).toBeNull();
  });

  it("отправленную, но не перечитанную запись отдаёт человеку без повтора", () => {
    const decision = decideSyncOutcome(
      { status: "synced", externalId: "ext-1", verified: false },
      1,
    );
    expect(decision.state).toBe("failed");
    expect(decision.createTask).toBe(true);
    expect(decision.error).toContain("verification_failed");
  });

  it("ненастроенный адаптер не тратит попытки и не будит сотрудника", () => {
    const decision = decideSyncOutcome(
      { status: "unavailable", message: "нет учётных данных" },
      3,
    );
    expect(decision.state).toBe("pending");
    expect(decision.countsAsAttempt).toBe(false);
    expect(decision.createTask).toBe(false);
    expect(decision.delaySeconds).toBe(3600);
  });

  it("повторяемая ошибка уходит в backoff, пока есть попытки", () => {
    const first = decideSyncOutcome(
      { status: "failed", errorCode: "timeout", message: "нет ответа", retryable: true },
      1,
    );
    const second = decideSyncOutcome(
      { status: "failed", errorCode: "timeout", message: "нет ответа", retryable: true },
      2,
    );
    expect(first.state).toBe("pending");
    expect(first.createTask).toBe(false);
    expect(second.delaySeconds).toBeGreaterThan(first.delaySeconds);
  });

  it("исчерпав попытки, ставит задачу сотруднику", () => {
    const decision = decideSyncOutcome(
      { status: "failed", errorCode: "timeout", message: "нет ответа", retryable: true },
      maxSyncAttempts,
    );
    expect(decision.state).toBe("failed");
    expect(decision.createTask).toBe(true);
  });

  it("неповторяемая ошибка не ждёт исчерпания попыток", () => {
    const decision = decideSyncOutcome(
      {
        status: "failed",
        errorCode: "appointment_missing",
        message: "нет записи",
        retryable: false,
      },
      1,
    );
    expect(decision.state).toBe("failed");
    expect(decision.createTask).toBe(true);
    expect(decision.delaySeconds).toBe(0);
  });

  it("без внешней МИС синхронизация не требуется", () => {
    const decision = decideSyncOutcome({ status: "not_required" }, 1);
    expect(decision.state).toBe("not_required");
    expect(decision.createTask).toBe(false);
  });
});

describe("адаптеры МИС", () => {
  it("sandbox не изображает внешнюю систему", async () => {
    const adapter = new SandboxMedicalInformationSystemAdapter();
    expect(await adapter.syncAppointment()).toEqual({ status: "not_required" });
  });

  it("DAMUMED честно сообщает, что ждёт доступ, вместо ложного успеха", async () => {
    const adapter = new DamuMedAdapter();
    const result = await adapter.syncAppointment();
    expect(result.status).toBe("unavailable");
    expect(await adapter.verifyAppointment()).toBe(false);
  });
});
