import { z } from "zod";
import { planCodes } from "@/lib/billing/plans";
import { notificationLocales } from "@/lib/notifications/templates";

const optionalText = (schema: z.ZodType<string>) =>
  z
    .union([schema, z.literal("")])
    .optional()
    .transform((value) => (value ? value : null));

/** Цвета подставляются в inline-style портала, поэтому только строгий hex. */
const hexColor = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Укажите цвет в формате #0a5b3b");

const httpsUrl = z
  .string()
  .trim()
  .max(500)
  .refine(
    (value) => URL.canParse(value) && new URL(value).protocol === "https:",
    "Логотип должен быть доступен по https.",
  );

export const brandingSchema = z.object({
  displayName: optionalText(z.string().trim().min(2).max(80)),
  primaryColor: optionalText(hexColor),
  accentColor: optionalText(hexColor),
  logoUrl: optionalText(httpsUrl),
  supportPhone: optionalText(
    z
      .string()
      .trim()
      .regex(/^\+[1-9]\d{7,14}$/, "Телефон в формате +77001234567"),
  ),
  supportEmail: optionalText(z.string().trim().email().max(160)),
  locale: z.enum(notificationLocales).default("ru"),
});

export type BrandingInput = z.infer<typeof brandingSchema>;

export const planChangeSchema = z.object({
  plan: z.enum(planCodes),
  billingEmail: optionalText(z.string().trim().email().max(160)),
});

export const notificationActionSchema = z.object({
  action: z.enum(["retry", "cancel"]),
});

export const waitlistActionSchema = z.object({
  action: z.enum(["accept", "decline", "cancel"]),
  idempotencyKey: z.string().uuid(),
});
