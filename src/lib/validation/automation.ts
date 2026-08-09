import { z } from "zod";
import {
  notificationChannels,
  notificationTemplateCodes,
} from "@/lib/notifications/templates";

export const automationCreateSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("scenario"),
    name: z.string().trim().min(3).max(100),
    triggerKind: z.enum([
      "appointment",
      "reschedule",
      "cancellation",
      "callback",
      "urgent",
      "faq",
    ]),
  }),
  z.object({
    kind: z.literal("campaign"),
    name: z.string().trim().min(3).max(100),
    purpose: z.string().trim().min(3).max(240),
    channel: z.enum(["voice", "whatsapp", "sms", "telegram", "email"]),
    locale: z.enum(["kk", "ru", "en"]),
  }),
  z.object({
    kind: z.literal("template"),
    // Только коды, которые действительно ищет диспетчер доставки.
    code: z.enum(notificationTemplateCodes),
    locale: z.enum(["kk", "ru", "en"]),
    channel: z.enum(notificationChannels),
    subject: z.string().trim().max(160).optional(),
    body: z.string().trim().min(3).max(4000),
  }),
]);
