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

export const publicAssistantRequestSchema = z.object({
  message: z.string().trim().min(1).max(1000),
  locale: z.enum(["ru", "kk", "en"]).default("ru"),
  identity: identitySchema.optional(),
});
