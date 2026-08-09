import { z } from "zod";
import { ruleCategories } from "@/lib/ai/knowledge-rules";

export const knowledgeRuleSchema = z.object({
  category: z.enum(ruleCategories),
  scope: z.enum(["clinic", "doctor", "service"]).default("clinic"),
  locale: z.enum(["ru", "kk", "en"]).default("ru"),
  title: z.string().trim().min(3).max(160),
  body: z.string().trim().min(3).max(4000),
  keywords: z.string().trim().max(400).optional(),
  priority: z.coerce.number().int().min(1).max(200).default(100),
});
