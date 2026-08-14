import { z } from "zod";
import {
  notificationChannels,
  notificationTemplateCodes,
} from "@/lib/notifications/templates";
import { scenarioGraphSchema } from "@/lib/scenarios/graph";
import { campaignChannels, campaignTypes } from "@/lib/campaigns/policy";

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

const timeValue = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const campaignAudienceSchema = z
  .object({
    lastVisitMonthsMin: z.number().int().min(0).max(120).optional(),
    lastVisitMonthsMax: z.number().int().min(1).max(120).optional(),
    specialtyId: z.string().uuid().optional(),
    branchId: z.string().uuid().optional(),
    language: z.enum(["ru", "kk", "en"]).optional(),
  })
  .refine(
    (value) =>
      value.lastVisitMonthsMin === undefined ||
      value.lastVisitMonthsMax === undefined ||
      value.lastVisitMonthsMax >= value.lastVisitMonthsMin,
    { message: "Максимальный период визита должен быть не меньше минимального." },
  );

const campaignDraftFields = z.object({
    name: z.string().trim().min(3).max(100),
    purpose: z.string().trim().min(3).max(240),
    campaignType: z.enum(campaignTypes),
    channel: z.enum(campaignChannels),
    locale: z.enum(["kk", "ru", "en"]),
    audienceFilter: campaignAudienceSchema,
    subject: z.string().trim().max(160).optional(),
    messageBody: z.string().trim().min(12).max(4000),
    timezone: z.string().trim().min(3).max(80),
    sendWindowStart: timeValue,
    sendWindowEnd: timeValue,
    dailyLimit: z.number().int().min(1).max(10000),
    periodDays: z.number().int().min(1).max(90),
    maxContacts: z.number().int().min(1).max(100000),
    frequencyCapDays: z.number().int().min(1).max(365),
    expectedRevision: z.number().int().positive(),
  });

const validSendWindow = (value: { sendWindowStart: string; sendWindowEnd: string }) =>
  value.sendWindowEnd > value.sendWindowStart;

export const campaignDraftSchema = campaignDraftFields.refine(validSendWindow, {
    message: "Конец окна отправки должен быть позже начала.",
  });

export const campaignPreviewSchema = campaignDraftFields
  .omit({ expectedRevision: true })
  .refine(validSendWindow, { message: "Конец окна отправки должен быть позже начала." });

export const campaignScheduleSchema = z.object({
  expectedRevision: z.number().int().positive(),
  startsAt: z.string().datetime(),
  confirmed: z.literal(true),
});

export const campaignStopSchema = z.object({ confirmed: z.literal(true) });
