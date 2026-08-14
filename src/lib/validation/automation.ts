import { z } from "zod";
import {
  notificationChannels,
  notificationTemplateCodes,
} from "@/lib/notifications/templates";
import { scenarioGraphSchema } from "@/lib/scenarios/graph";

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

export const scenarioSaveSchema = z.object({
  name: z.string().trim().min(3).max(100),
  expectedVersion: z.number().int().positive(),
  expectedRevision: z.number().int().positive(),
  graph: scenarioGraphSchema,
  changeSummary: z.string().trim().max(240).optional(),
});

export const scenarioPublishSchema = z.object({
  version: z.number().int().positive(),
  confirmed: z.literal(true),
});

export const scenarioTestSchema = z.object({
  version: z.number().int().positive(),
  outcome: z.enum(["success", "fallback"]),
});

export const scenarioRollbackSchema = z.object({
  targetVersion: z.number().int().positive(),
  confirmed: z.literal(true),
});
