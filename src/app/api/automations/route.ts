import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { requireRoles } from "@/lib/dal/auth";
import { apiError } from "@/lib/errors";
import { automationCreateSchema } from "@/lib/validation/automation";
import { defaultScenarioGraph, validateScenarioGraph } from "@/lib/scenarios/graph";

export async function POST(request: Request) {
  try {
    const user = await requireRoles(["clinic_admin"]);
    const input = automationCreateSchema.parse(await request.json());
    const sql = db();
    const id = randomUUID();

    if (input.kind === "scenario") {
      const versionId = randomUUID();
      const graph = defaultScenarioGraph(input.triggerKind);
      const validation = validateScenarioGraph(graph);
      await sql.transaction([
        sql`
          INSERT INTO scenarios (
            id, tenant_id, name, trigger_kind, status, created_by
          ) VALUES (
            ${id}, ${user.tenantId}, ${input.name}, ${input.triggerKind}, 'draft', ${user.id}
          )
        `,
        sql`
          INSERT INTO scenario_versions (
            id, tenant_id, scenario_id, version, graph, validation_status, created_by
          ) VALUES (
            ${versionId}, ${user.tenantId}, ${id}, 1, ${JSON.stringify(graph)}::jsonb,
            ${validation.valid ? "valid" : "invalid"}, ${user.id}
          )
        `,
        sql`
          INSERT INTO audit_events (tenant_id, actor_user_id, action, resource_type, resource_id)
          VALUES (${user.tenantId}, ${user.id}, 'scenario.created', 'scenario', ${id})
        `,
      ]);
    } else if (input.kind === "campaign") {
      await sql.transaction([
        sql`
          INSERT INTO campaigns (
            id, tenant_id, name, purpose, channel, locale, status,
            audience_filter, created_by
          ) VALUES (
            ${id}, ${user.tenantId}, ${input.name}, ${input.purpose},
            ${input.channel}, ${input.locale}, 'draft',
            ${JSON.stringify({ consentRequired: true, optOutRequired: true })}::jsonb,
            ${user.id}
          )
        `,
        sql`
          INSERT INTO audit_events (tenant_id, actor_user_id, action, resource_type, resource_id)
          VALUES (${user.tenantId}, ${user.id}, 'campaign.created', 'campaign', ${id})
        `,
      ]);
    } else {
      await sql.transaction([
        sql`
          INSERT INTO notification_templates (
            id, tenant_id, code, locale, channel, subject, body, status
          ) VALUES (
            ${id}, ${user.tenantId}, ${input.code}, ${input.locale}, ${input.channel},
            ${input.subject || null}, ${input.body}, 'draft'
          )
        `,
        sql`
          INSERT INTO audit_events (tenant_id, actor_user_id, action, resource_type, resource_id)
          VALUES (${user.tenantId}, ${user.id}, 'notification_template.created', 'notification_template', ${id})
        `,
      ]);
    }
    return Response.json({ ok: true, id }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
