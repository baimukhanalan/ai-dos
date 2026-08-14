import { z } from "zod";

export const consentPurposes = [
  "data_processing",
  "call_recording",
  "messages",
  "whatsapp",
  "outbound_calls",
  "marketing_campaign",
] as const;

export const consentSchema = z.object({
  purpose: z.enum(consentPurposes),
  status: z.enum(["granted", "withdrawn"]),
  source: z
    .enum(["reception", "phone", "website", "whatsapp", "document", "patient_portal"])
    .default("reception"),
  textVersion: z.string().trim().min(1).max(40).default("v1"),
});

export type ConsentInput = z.infer<typeof consentSchema>;
