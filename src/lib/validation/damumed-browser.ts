import { z } from "zod";

const strictNullableText = (max: number) => z.string().trim().min(1).max(max).nullable().default(null);

const externalSlotSchema = z
  .object({
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
    status: z.enum(["available", "booked", "break", "unknown"]),
  })
  .strict()
  .refine((value) => new Date(value.endsAt) > new Date(value.startsAt), {
    message: "Конец внешнего слота должен быть позже начала.",
    path: ["endsAt"],
  })
  .refine(
    (value) => new Date(value.endsAt).getTime() - new Date(value.startsAt).getTime() <= 8 * 60 * 60 * 1000,
    { message: "Внешний слот не может быть длиннее 8 часов.", path: ["endsAt"] },
  );

const externalDoctorSchema = z
  .object({
    externalId: z.string().trim().min(2).max(200),
    name: z.string().trim().min(3).max(180),
    specialty: strictNullableText(140),
    room: strictNullableText(80),
    slots: z.array(externalSlotSchema).max(200),
  })
  .strict();

export const damumedDirectorySnapshotSchema = z
  .object({
    tenantId: z.string().uuid(),
    scheduleDate: z.string().date(),
    observedAt: z.string().datetime({ offset: true }),
    sourceUrl: z
      .string()
      .url()
      .refine((value) => new URL(value).protocol === "https:" && new URL(value).hostname === "reg-ala.dmed.kz", "Разрешён только reg-ala.dmed.kz."),
    doctors: z.array(externalDoctorSchema).min(1).max(200),
  })
  .strict()
  .superRefine((value, context) => {
    const ids = new Set<string>();
    for (const [index, doctor] of value.doctors.entries()) {
      if (ids.has(doctor.externalId)) context.addIssue({ code: "custom", message: "Врач повторяется в снимке.", path: ["doctors", index, "externalId"] });
      ids.add(doctor.externalId);
    }
  });

export type DamuMedDirectorySnapshotInput = z.infer<typeof damumedDirectorySnapshotSchema>;
