import { describe, expect, it } from "vitest";
import {
  misQueueQuerySchema,
  misResultsSchema,
  misSyncResultSchema,
} from "@/lib/validation/mis";
import { authorizeSecret } from "@/lib/cron";

function requestWith(header: string | null) {
  return new Request("https://example.test/api/mis/queue", {
    headers: header ? { authorization: header } : {},
  });
}

describe("контракт внешнего воркера МИС", () => {
  it("успех обязан нести внешний id и признак перечитывания", () => {
    expect(
      misSyncResultSchema.safeParse({ status: "synced", externalId: "A-1", verified: true })
        .success,
    ).toBe(true);
    expect(
      misSyncResultSchema.safeParse({ status: "synced", externalId: "A-1" }).success,
    ).toBe(false);
    expect(
      misSyncResultSchema.safeParse({ status: "synced", verified: true }).success,
    ).toBe(false);
  });

  it("ошибка обязана указывать, повторять ли попытку", () => {
    expect(
      misSyncResultSchema.safeParse({
        status: "failed",
        errorCode: "timeout",
        message: "нет ответа",
        retryable: true,
      }).success,
    ).toBe(true);
    expect(
      misSyncResultSchema.safeParse({
        status: "failed",
        errorCode: "timeout",
        message: "нет ответа",
      }).success,
    ).toBe(false);
  });

  it("неизвестный статус не проходит", () => {
    expect(misSyncResultSchema.safeParse({ status: "maybe" }).success).toBe(false);
  });

  it("воркер не может диктовать число попыток", () => {
    const parsed = misResultsSchema.parse({
      results: [
        {
          appointmentId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
          attempts: 0,
          result: { status: "not_required" },
        },
      ],
    });
    expect(parsed.results[0]).not.toHaveProperty("attempts");
  });

  it("пустой и переполненный отчёт отклоняются", () => {
    expect(misResultsSchema.safeParse({ results: [] }).success).toBe(false);
    expect(
      misResultsSchema.safeParse({
        results: Array.from({ length: 101 }, () => ({
          appointmentId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
          result: { status: "not_required" },
        })),
      }).success,
    ).toBe(false);
  });

  it("размер выборки очереди ограничен", () => {
    expect(misQueueQuerySchema.parse({}).limit).toBe(20);
    expect(misQueueQuerySchema.parse({ limit: "5" }).limit).toBe(5);
    expect(misQueueQuerySchema.safeParse({ limit: "500" }).success).toBe(false);
  });

  it("незаданный секрет не открывает доступ", () => {
    expect(authorizeSecret(requestWith("Bearer "), undefined)).toBe(false);
    expect(authorizeSecret(requestWith(null), undefined)).toBe(false);
    expect(authorizeSecret(requestWith("Bearer secret"), "secret")).toBe(true);
    expect(authorizeSecret(requestWith("Bearer wrong"), "secret")).toBe(false);
  });
});
