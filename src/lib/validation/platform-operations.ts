import { z } from "zod";

import { planCodes } from "@/lib/billing/plans";
import { usageMetrics } from "@/lib/billing/metrics";
import { brandingSchema } from "@/lib/validation/billing";

const tenantId = z.string().uuid();

export const platformSettingsSchema = z.object({
  maintenanceMode: z.boolean().default(false),
  supportEmail: z.string().email().nullable().default(null),
  defaultLocale: z.enum(["ru-KZ", "kk-KZ", "en-US"]).default("ru-KZ"),
  defaultTimezone: z.string().min(3).max(80).default("Asia/Almaty"),
});

export function parsePlatformSettings(value: unknown) {
  const parsed = platformSettingsSchema.safeParse(value);
  return parsed.success ? parsed.data : platformSettingsSchema.parse({});
}

export const platformOperationSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("subscription.update"), tenantId,
    plan: z.enum(planCodes), status: z.enum(["trial", "active", "past_due", "cancelled"]),
    currentPeriodEnd: z.string().date().nullable(),
  }),
  z.object({
    action: z.literal("limit.update"), tenantId, metric: z.enum(usageMetrics),
    limit: z.number().int().min(0).max(1_000_000_000).nullable(),
  }),
  z.object({
    action: z.literal("payment.create"), tenantId,
    periodStart: z.string().date(), periodEnd: z.string().date(),
    amountKzt: z.number().int().min(0).max(2_000_000_000),
    status: z.enum(["pending", "paid", "failed", "refunded", "waived"]),
    note: z.string().trim().max(500).nullable(),
  }).refine((value) => value.periodEnd >= value.periodStart, { message: "Конец периода раньше начала.", path: ["periodEnd"] }),
  z.object({
    action: z.literal("support.create"), tenantId,
    subject: z.string().trim().min(3).max(180),
    category: z.enum(["general", "billing", "integration", "telephony", "incident"]),
    priority: z.enum(["low", "normal", "high", "urgent"]),
    description: z.string().trim().max(2000).nullable(),
  }),
  z.object({
    action: z.literal("support.status"), ticketId: z.string().uuid(),
    status: z.enum(["open", "in_progress", "resolved", "closed"]),
  }),
  z.object({
    action: z.literal("flag.update"), tenantId, key: z.string().trim().min(2).max(100).regex(/^[a-z0-9._-]+$/),
    enabled: z.boolean(),
  }),
  z.object({
    action: z.literal("settings.update"), maintenanceMode: z.boolean(),
    supportEmail: z.string().trim().email().nullable(),
    defaultLocale: z.enum(["ru-KZ", "kk-KZ", "en-US"]),
    defaultTimezone: z.string().trim().min(3).max(80),
  }),
  z.object({ action: z.literal("branding.update"), tenantId, branding: brandingSchema }),
]);

export type PlatformOperationInput = z.infer<typeof platformOperationSchema>;
