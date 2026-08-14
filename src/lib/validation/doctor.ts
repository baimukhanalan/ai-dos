import { z } from "zod";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const doctorAvailabilitySchema = z
  .object({
    kind: z.enum(["break", "unavailable", "vacation", "extra_slot"]),
    date: z.string().date(),
    startsAt: time.nullable().optional(),
    endsAt: time.nullable().optional(),
    reason: z.string().trim().min(3).max(240),
    idempotencyKey: z.string().uuid(),
  })
  .superRefine((value, context) => {
    if (value.date < new Date().toISOString().slice(0, 10)) {
      context.addIssue({
        code: "custom",
        path: ["date"],
        message: "Нельзя изменить доступность задним числом.",
      });
    }
    if (value.kind === "vacation") return;
    if (!value.startsAt || !value.endsAt || value.startsAt >= value.endsAt) {
      context.addIssue({
        code: "custom",
        path: ["startsAt"],
        message: "Укажите корректный интервал времени.",
      });
    }
  });

export type DoctorAvailabilityInput = z.infer<typeof doctorAvailabilitySchema>;
