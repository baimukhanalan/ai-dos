import { z } from "zod";
import {
  geminiLiveVoices,
  realtimeModels,
  realtimeVoices,
} from "@/lib/voice/config";

export const geminiLiveSessionSchema = z.object({
  voice: z.enum(geminiLiveVoices).default("Zephyr"),
  language: z
    .string()
    .trim()
    .min(2)
    .max(12)
    .regex(/^(auto|[a-z]{2,3}(?:-[A-Z]{2})?)$/)
    .default("auto"),
  recordingConsent: z.literal(true),
});

export const voiceSessionSchema = z.object({
  model: z.enum(realtimeModels).default("gpt-realtime-2.1-mini"),
  voice: z.enum(realtimeVoices).default("marin"),
  language: z
    .string()
    .trim()
    .min(2)
    .max(12)
    .regex(/^(auto|[a-z]{2,3}(?:-[A-Z]{2})?)$/)
    .default("auto"),
  speed: z.number().min(0.75).max(1.25).default(1),
  recordingConsent: z.literal(true),
});

export const voiceSessionResultSchema = z.object({
  sessionId: z.string().uuid(),
  status: z.enum(["connected", "completed", "failed"]),
  detectedLanguage: z.string().max(12).optional(),
  latencyMs: z.number().int().min(0).max(120_000).optional(),
  errorCode: z.string().max(100).optional(),
  transcript: z
    .array(
      z.object({
        role: z.enum(["patient", "assistant", "system"]),
        text: z.string().max(4000),
        at: z.string().datetime(),
      }),
    )
    .max(200),
});

export const phoneNumberSchema = z.object({
  e164: z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{7,14}$/, "Введите номер в формате +77001234567"),
  label: z.string().trim().min(2).max(80),
  provider: z.enum(["sip", "twilio", "zadarma", "binotel", "asterisk", "other"]),
  voice: z.enum(realtimeVoices),
  greeting: z.string().trim().max(300).optional(),
  languages: z.array(z.string().regex(/^[a-z]{2,3}$/)).min(1).max(12),
  active: z.boolean().default(false),
});
