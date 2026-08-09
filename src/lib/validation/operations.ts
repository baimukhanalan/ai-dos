import { z } from "zod";

const phoneSchema = z
  .string()
  .trim()
  .transform((value) => {
    const digits = value.replace(/\D/g, "");
    return value.startsWith("+") ? `+${digits}` : digits;
  })
  .refine((value) => /^\+?\d{7,15}$/.test(value), {
    message: "Укажите корректный номер телефона",
  });

export const patientSchema = z.object({
  fullName: z.string().trim().min(2).max(160),
  phone: phoneSchema,
  birthDate: z.string().date().optional().or(z.literal("")),
  preferredLanguage: z.enum(["ru", "kk", "en"]).default("ru"),
  notes: z.string().trim().max(1200).optional(),
});

export const appointmentSchema = z.object({
  patientId: z.string().uuid(),
  doctorId: z.string().uuid(),
  serviceId: z.string().uuid().nullable().optional(),
  startsAt: z.string().datetime({ offset: true }),
  reason: z.string().trim().max(500).optional(),
  idempotencyKey: z.string().min(12).max(128),
});

export const appointmentChangeSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("cancel"),
    reason: z.string().trim().min(3).max(500),
    idempotencyKey: z.string().min(12).max(128),
  }),
  z.object({
    action: z.literal("reschedule"),
    startsAt: z.string().datetime({ offset: true }),
    reason: z.string().trim().min(3).max(500),
    idempotencyKey: z.string().min(12).max(128),
  }),
]);

export const callbackSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: phoneSchema,
  reason: z.string().trim().min(3).max(500),
  preferredTime: z.string().trim().max(120).optional(),
  priority: z.enum(["normal", "high", "urgent"]).default("normal"),
  idempotencyKey: z.string().min(12).max(128),
});

const chatPartSchema = z
  .object({
    type: z.string().min(1).max(100),
    text: z.string().max(8000).optional(),
  })
  .passthrough();

const chatMessageSchema = z
  .object({
    id: z.string().max(200).optional(),
    role: z.enum(["user", "assistant"]),
    parts: z.array(chatPartSchema).max(30),
  })
  .passthrough();

export const chatRequestSchema = z
  .object({
    messages: z.array(chatMessageSchema).min(1).max(40),
    conversationId: z.string().uuid().optional(),
    locale: z.enum(["ru", "kk", "en"]).default("ru"),
  })
  .refine((value) => value.messages.at(-1)?.role === "user", {
    path: ["messages"],
    message: "The latest chat message must come from the user.",
  });
