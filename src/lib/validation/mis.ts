import { z } from "zod";

export const misSyncResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("synced"),
    externalId: z.string().trim().min(1).max(200),
    /** Воркер обязан подтвердить, что перечитал запись из МИС. */
    verified: z.boolean(),
  }),
  z.object({ status: z.literal("not_required") }),
  z.object({
    status: z.literal("unavailable"),
    message: z.string().trim().min(1).max(300),
  }),
  z.object({
    status: z.literal("failed"),
    errorCode: z.string().trim().min(1).max(100),
    message: z.string().trim().min(1).max(300),
    retryable: z.boolean(),
  }),
]);

/**
 * Количество попыток воркер не передаёт: бюджет повторов считает сервер,
 * иначе сбойный воркер мог бы обнулять его бесконечно.
 */
export const misResultsSchema = z.object({
  results: z
    .array(
      z.object({
        appointmentId: z.string().uuid(),
        durationMs: z.number().int().min(0).max(600_000).optional(),
        result: misSyncResultSchema,
      }),
    )
    .min(1)
    .max(100),
});

export const misQueueQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
