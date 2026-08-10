import { z } from "zod";

export const bookingTurnSchema = z.object({
  message: z.string().trim().min(1).max(1000),
  patientId: z.string().uuid().nullable().optional(),
  conversationId: z.string().uuid().nullable().optional(),
  channel: z
    .enum(["web", "phone", "whatsapp", "telegram", "portal", "mcp"])
    .default("web"),
});

export type BookingTurnRequest = z.infer<typeof bookingTurnSchema>;
