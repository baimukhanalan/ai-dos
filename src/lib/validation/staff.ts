import { z } from "zod";
import { passwordSchema } from "@/lib/validation/auth";

export const staffInvitationSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120),
    email: z.string().trim().toLowerCase().email(),
    role: z.enum(["operator", "doctor"]),
    doctorId: z.string().uuid().nullable().optional(),
    idempotencyKey: z.string().uuid(),
  })
  .refine(
    (value) =>
      value.role === "doctor" ? Boolean(value.doctorId) : !value.doctorId,
    { message: "Для врача выберите профиль врача.", path: ["doctorId"] },
  );

export const acceptStaffInvitationSchema = z.object({
  token: z.string().trim().min(32).max(512),
  password: passwordSchema,
});

export type StaffInvitationInput = z.infer<typeof staffInvitationSchema>;
export type AcceptStaffInvitationInput = z.infer<
  typeof acceptStaffInvitationSchema
>;
