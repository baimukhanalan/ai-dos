import { afterEach, describe, expect, it } from "vitest";
import {
  isE164,
  isEmailAddress,
  providerName,
} from "@/lib/notifications/providers";
import {
  channelPriority,
  maxDeliveryAttempts,
  pickChannel,
  recipientForChannel,
  retryDelayMs,
} from "@/lib/notifications/routing";

const contact = { phone: "+77001234567", email: "patient@clinic.kz" };
const all = () => true;
const onlyPortal = (channel: string) => channel === "portal";

afterEach(() => {
  delete process.env.NOTIFY_CHANNEL_PRIORITY;
});

describe("маршрутизация уведомлений", () => {
  it("растёт по экспоненте и упирается в потолок", () => {
    expect(retryDelayMs(1)).toBe(2 * 60_000);
    expect(retryDelayMs(2)).toBe(4 * 60_000);
    expect(retryDelayMs(3)).toBe(8 * 60_000);
    expect(retryDelayMs(99)).toBe(retryDelayMs(maxDeliveryAttempts));
    expect(retryDelayMs(0)).toBe(retryDelayMs(1));
  });

  it("берёт первый настроенный канал с пригодным адресом", () => {
    expect(pickChannel(contact, { configured: all })).toEqual({
      channel: "whatsapp",
      recipient: "+77001234567",
    });
  });

  it("пропускает канал, для которого нет адреса", () => {
    expect(
      pickChannel({ email: "patient@clinic.kz" }, { configured: all }),
    ).toEqual({ channel: "email", recipient: "patient@clinic.kz" });
  });

  it("возвращается в портал, когда внешние провайдеры не настроены", () => {
    expect(pickChannel(contact, { configured: onlyPortal })).toEqual({
      channel: "portal",
      recipient: null,
    });
  });

  it("никогда не теряет уведомление, даже если ничего не настроено", () => {
    expect(pickChannel({}, { configured: () => false })).toEqual({
      channel: "portal",
      recipient: null,
    });
  });

  it("telegram не выбирается без chat id", () => {
    expect(
      pickChannel(contact, { configured: all, priority: ["telegram", "portal"] }),
    ).toEqual({ channel: "portal", recipient: null });
    expect(
      pickChannel(
        { ...contact, telegramChatId: "123456789" },
        { configured: all, priority: ["telegram", "portal"] },
      ),
    ).toEqual({ channel: "telegram", recipient: "123456789" });
  });

  it("читает приоритет из окружения и всегда оставляет портал в конце", () => {
    process.env.NOTIFY_CHANNEL_PRIORITY = "sms, email";
    expect(channelPriority()).toEqual(["sms", "email", "portal"]);
  });

  it("игнорирует неизвестные каналы в настройке приоритета", () => {
    process.env.NOTIFY_CHANNEL_PRIORITY = "viber,sms";
    expect(channelPriority()).toEqual(["sms", "portal"]);
  });

  it("проверяет формат адресата под канал", () => {
    expect(recipientForChannel("sms", { phone: "87001234567" })).toBeNull();
    expect(recipientForChannel("sms", { phone: "+77001234567" })).toBe(
      "+77001234567",
    );
    expect(recipientForChannel("email", { email: "не почта" })).toBeNull();
    expect(recipientForChannel("portal", contact)).toBeNull();
  });

  it("узнаёт корректные телефон и почту", () => {
    expect(isE164("+77001234567")).toBe(true);
    expect(isE164("+7700")).toBe(false);
    expect(isE164(null)).toBe(false);
    expect(isEmailAddress("info@clinic.kz")).toBe(true);
    expect(isEmailAddress("info@clinic")).toBe(false);
  });

  it("называет провайдера каждого канала", () => {
    expect(providerName("portal")).toBe("portal");
    expect(providerName("telegram")).toBe("telegram_bot_api");
    expect(providerName("sms")).toBe("sms_gateway");
  });
});
