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

const decisionNote = z.string().trim().max(500).optional();

/**
 * Решение администратора по срочному запросу. `approve` вписывает пациента
 * вне графика, `offer` предлагает штатное время, `decline` — отказ.
 */
export const urgentDecisionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("approve"),
    startsAt: z.string().datetime({ offset: true }),
    note: decisionNote,
  }),
  z.object({
    action: z.literal("offer"),
    startsAt: z.string().datetime({ offset: true }),
    note: decisionNote,
  }),
  z.object({ action: z.literal("decline"), note: decisionNote }),
]);
