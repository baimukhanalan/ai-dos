import { describe, expect, it } from "vitest";
import { outboxTemplates, targetAppointmentId } from "@/lib/notifications/outbox";
import { notificationTemplateCodes } from "@/lib/notifications/templates";

describe("отображение событий outbox в уведомления", () => {
  it("каждое сопоставление ссылается на существующий шаблон", () => {
    for (const [topic, code] of Object.entries(outboxTemplates)) {
      if (code === null) continue;
      expect(notificationTemplateCodes, topic).toContain(code);
    }
  });

  it("перенос уведомляет о новой записи, а не о закрытой", () => {
    expect(
      targetAppointmentId({
        id: "event",
        tenant_id: "tenant",
        topic: "appointment.rescheduled",
        aggregate_type: "appointment",
        aggregate_id: "old-appointment",
        payload: { replacementId: "new-appointment" },
        attempts: 0,
      }),
    ).toBe("new-appointment");
  });

  it("без записи-замены остаётся исходный агрегат", () => {
    expect(
      targetAppointmentId({
        id: "event",
        tenant_id: "tenant",
        topic: "appointment.cancelled",
        aggregate_type: "appointment",
        aggregate_id: "appointment",
        payload: {},
        attempts: 0,
      }),
    ).toBe("appointment");
  });

  it("неизвестное событие не имеет шаблона", () => {
    expect(outboxTemplates["something.unknown"]).toBeUndefined();
  });
});
