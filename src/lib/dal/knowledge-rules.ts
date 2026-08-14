import "server-only";

import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { requireRoles } from "@/lib/dal/auth";
import type { KnowledgeRule } from "@/lib/ai/knowledge-rules";
import type { z } from "zod";
import type { knowledgeRuleSchema } from "@/lib/validation/knowledge-rule";

type RuleRow = {
  id: string;
  category: KnowledgeRule["category"];
  scope: KnowledgeRule["scope"];
  scope_ref: string | null;
  locale: KnowledgeRule["locale"];
  title: string;
  body: string;
  keywords: string[];
  priority: number;
};

function toRule(row: RuleRow): KnowledgeRule {
  return {
    id: row.id,
    category: row.category,
    scope: row.scope,
    scopeRef: row.scope_ref,
    locale: row.locale,
    title: row.title,
    body: row.body,
    keywords: row.keywords ?? [],
    priority: row.priority,
  };
}

/** Опубликованные правила клиники для матчинга ассистентом. */
export async function loadKnowledgeRules(tenantId: string): Promise<KnowledgeRule[]> {
  const sql = db();
  const rows = (await sql`
    SELECT id, category, scope, scope_ref, locale, title, body, keywords, priority
    FROM knowledge_rules
    WHERE tenant_id = ${tenantId} AND status = 'published'
    ORDER BY priority, updated_at DESC
    LIMIT 300
  `) as RuleRow[];
  return rows.map(toRule);
}

export async function getKnowledgeRulesForPortal() {
  const user = await requireRoles(["clinic_admin", "operator"]);
  const sql = db();
  const rows = (await sql`
    SELECT id, category, scope, scope_ref, locale, title, body, keywords, priority, status, updated_at
    FROM knowledge_rules
    WHERE tenant_id = ${user.tenantId}
    ORDER BY category, priority, updated_at DESC
    LIMIT 200
  `) as Array<RuleRow & { status: string; updated_at: string }>;
  return { user, rules: rows };
}

type RuleInput = z.infer<typeof knowledgeRuleSchema>;

export async function createKnowledgeRule(input: RuleInput) {
  const user = await requireRoles(["clinic_admin"]);
  const sql = db();
  const id = randomUUID();
  const keywords = input.keywords
    ? input.keywords.split(",").map((k) => k.trim()).filter(Boolean).slice(0, 20)
    : [];
  await sql.transaction([
    sql`
      INSERT INTO knowledge_rules (
        id, tenant_id, category, scope, locale, title, body, keywords, priority, status, created_by
      ) VALUES (
        ${id}, ${user.tenantId}, ${input.category}, ${input.scope}, ${input.locale},
        ${input.title}, ${input.body}, ${keywords}, ${input.priority}, 'published', ${user.id}
      )
    `,
    sql`
      INSERT INTO audit_events (tenant_id, actor_user_id, action, resource_type, resource_id)
      VALUES (${user.tenantId}, ${user.id}, 'knowledge_rule.created', 'knowledge_rule', ${id})
    `,
  ]);
  return { id };
}
