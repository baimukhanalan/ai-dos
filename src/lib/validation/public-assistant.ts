import { z } from "zod";

const identitySchema = z
  .object({
    phone: z.string().trim().min(7).max(24),
    surname: z.string().trim().min(2).max(120).optional(),
    birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .refine((value) => Boolean(value.surname || value.birthDate), {
    message: "Укажите фамилию или дату рождения.",
  });

const registrationSchema = z.object({
  fullName: z.string().trim().min(3).max(160),
  phone: z
    .string()
    .trim()
    .min(7)
    .max(24)
    .refine((value) => {
      const digits = value.replace(/\D/g, "");
      return /^\+?\d(?:[\d\s()-]*\d)?$/.test(value)
        && digits.length >= 7
        && digits.length <= 15;
    }, {
      message: "Укажите корректный номер телефона.",
    }),
  birthDate: z
    .string()
    .date()
    .refine((value) => new Date(`${value}T00:00:00Z`) <= new Date(), {
      message: "Дата рождения не может быть в будущем.",
    }),
  consent: z.literal(true),
});

export const publicAssistantRequestSchema = z
  .object({
    message: z.string().trim().min(1).max(1000),
    locale: z.enum(["ru", "kk", "en"]).default("ru"),
    identity: identitySchema.optional(),
    registration: registrationSchema.optional(),
  })
  .refine((value) => !(value.identity && value.registration), {
    message: "Выберите подтверждение или регистрацию пациента.",
  });
