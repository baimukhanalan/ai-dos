import { apiError } from "@/lib/errors";
import { createKnowledgeRule } from "@/lib/dal/knowledge-rules";
import { knowledgeRuleSchema } from "@/lib/validation/knowledge-rule";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const input = knowledgeRuleSchema.parse(await request.json());
    const rule = await createKnowledgeRule(input);
    return Response.json({ ok: true, rule });
  } catch (error) {
    return apiError(error);
  }
}
