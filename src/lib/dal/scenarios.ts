import "server-only";

import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/dal/auth";
import { AppError } from "@/lib/errors";
import {
  normalizeScenarioGraph,
  simulateScenario,
  validateScenarioGraph,
  type ScenarioGraph,
} from "@/lib/scenarios/graph";
import type {
  scenarioPublishSchema,
  scenarioRollbackSchema,
  scenarioSaveSchema,
  scenarioTestSchema,
} from "@/lib/validation/automation";
import type { z } from "zod";
import type { AuditRequestContext } from "@/lib/audit-context";

type ScenarioSaveInput = z.infer<typeof scenarioSaveSchema>;
type ScenarioPublishInput = z.infer<typeof scenarioPublishSchema>;
type ScenarioTestInput = z.infer<typeof scenarioTestSchema>;
type ScenarioRollbackInput = z.infer<typeof scenarioRollbackSchema>;

type ScenarioVersionRow = {
  id: string;
  version: number;
  revision: number;
  graph: ScenarioGraph;
  validation_status: string;
  validation_errors: string[];
  change_summary: string | null;
  published_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
  created_by_name?: string | null;
  published_by_name?: string | null;
};

export async function getScenarioEditor(scenarioId: string) {
  const user = await requirePermission("scenarios.read");
  const sql = db();
  const scenarios = (await sql`
    SELECT id, name, trigger_kind, status, active_version, created_at, updated_at
    FROM scenarios
    WHERE id = ${scenarioId} AND tenant_id = ${user.tenantId}
    LIMIT 1
  `) as Array<{
    id: string;
    name: string;
    trigger_kind: string;
    status: string;
    active_version: number | null;
    created_at: string | Date;
    updated_at: string | Date;
  }>;
  if (!scenarios[0]) return null;
  const versions = (await sql`
    SELECT v.id, v.version, v.revision, v.graph, v.validation_status,
      v.validation_errors, v.change_summary, v.published_at, v.created_at,
      v.updated_at, creator.full_name AS created_by_name,
      publisher.full_name AS published_by_name
    FROM scenario_versions v
    LEFT JOIN users creator ON creator.id = v.created_by AND creator.tenant_id = v.tenant_id
    LEFT JOIN users publisher ON publisher.id = v.published_by AND publisher.tenant_id = v.tenant_id
    WHERE v.tenant_id = ${user.tenantId} AND v.scenario_id = ${scenarioId}
    ORDER BY v.version DESC
  `) as ScenarioVersionRow[];
  const current = versions[0];
  if (!current) throw new AppError("scenario_version_missing", 409, "У сценария нет версии для редактирования.");
  return {
    user,
    scenario: scenarios[0],
    current: { ...current, graph: normalizeScenarioGraph(current.graph) },
    versions,
    validation: validateScenarioGraph(current.graph),
  };
}

export async function saveScenarioDraft(scenarioId: string, input: ScenarioSaveInput, context?: AuditRequestContext) {
  const user = await requirePermission("scenarios.write");
  const sql = db();
  const scenarioRows = (await sql`
    SELECT id, name, active_version
    FROM scenarios
    WHERE id = ${scenarioId} AND tenant_id = ${user.tenantId}
    LIMIT 1
  `) as Array<{ id: string; name: string; active_version: number | null }>;
  const scenario = scenarioRows[0];
  if (!scenario) throw new AppError("scenario_not_found", 404, "Сценарий не найден.");
  const latestRows = (await sql`
    SELECT id, version, revision, graph
    FROM scenario_versions
    WHERE scenario_id = ${scenarioId} AND tenant_id = ${user.tenantId}
    ORDER BY version DESC LIMIT 1
  `) as Array<{ id: string; version: number; revision: number; graph: ScenarioGraph }>;
  const latest = latestRows[0];
  if (!latest || latest.version !== input.expectedVersion || latest.revision !== input.expectedRevision) {
    throw new AppError("scenario_conflict", 409, "Сценарий изменился в другой вкладке. Обновите страницу.");
  }
  const validation = validateScenarioGraph(input.graph);
  const validationErrors = JSON.stringify(validation.errors);
  const graph = JSON.stringify(input.graph);
  const nextVersion = latest.version + 1;

  try {
    if (scenario.active_version === latest.version) {
      await sql.transaction([
        sql`
          INSERT INTO scenario_versions (
            id, tenant_id, scenario_id, version, revision, graph,
            validation_status, validation_errors, change_summary, created_by
          ) VALUES (
            ${randomUUID()}, ${user.tenantId}, ${scenarioId}, ${nextVersion}, 1,
            ${graph}::jsonb, ${validation.valid ? "valid" : "invalid"},
            ${validationErrors}::jsonb, ${input.changeSummary || "Изменения после публикации"}, ${user.id}
          )
        `,
        sql`UPDATE scenarios SET name = ${input.name}, updated_at = now() WHERE id = ${scenarioId} AND tenant_id = ${user.tenantId}`,
        sql`
          INSERT INTO audit_events (
            tenant_id, actor_user_id, action, resource_type, resource_id, metadata, ip_hash
          ) VALUES (
            ${user.tenantId}, ${user.id}, 'scenario.draft_created', 'scenario', ${scenarioId},
            ${JSON.stringify({ fromVersion: latest.version, toVersion: nextVersion, previousName: scenario.name, nextName: input.name, requestId: context?.requestId, userAgent: context?.userAgent })}::jsonb,
            ${context?.ipHash || null}
          )
        `,
      ]);
      return { version: nextVersion, revision: 1, validation };
    }

    const updated = await sql`
      UPDATE scenario_versions v SET
        graph = ${graph}::jsonb,
        validation_status = ${validation.valid ? "valid" : "invalid"},
        validation_errors = ${validationErrors}::jsonb,
        change_summary = ${input.changeSummary || null},
        revision = revision + 1,
        updated_at = now()
      WHERE v.id = ${latest.id}
        AND v.tenant_id = ${user.tenantId}
        AND v.revision = ${input.expectedRevision}
        AND v.version <> COALESCE((
          SELECT active_version FROM scenarios
          WHERE id = ${scenarioId} AND tenant_id = ${user.tenantId}
        ), 0)
      RETURNING version, revision
    `;
    if (!updated[0]) throw new AppError("scenario_conflict", 409, "Версия уже опубликована или изменена. Обновите страницу.");
    await sql.transaction([
      sql`UPDATE scenarios SET name = ${input.name}, updated_at = now() WHERE id = ${scenarioId} AND tenant_id = ${user.tenantId}`,
      sql`
        INSERT INTO audit_events (tenant_id, actor_user_id, action, resource_type, resource_id, metadata, ip_hash)
        VALUES (
          ${user.tenantId}, ${user.id}, 'scenario.draft_updated', 'scenario', ${scenarioId},
          ${JSON.stringify({ version: latest.version, revision: Number(updated[0].revision), previousName: scenario.name, nextName: input.name, requestId: context?.requestId, userAgent: context?.userAgent })}::jsonb,
          ${context?.ipHash || null}
        )
      `,
    ]);
    return { version: Number(updated[0].version), revision: Number(updated[0].revision), validation };
  } catch (error) {
    const databaseError = error as { code?: string };
    if (databaseError.code === "23505") throw new AppError("scenario_conflict", 409, "Версия уже создана. Обновите страницу.");
    throw error;
  }
}

export async function publishScenarioVersion(scenarioId: string, input: ScenarioPublishInput, context?: AuditRequestContext) {
  const user = await requirePermission("scenarios.publish");
  const sql = db();
  const rows = (await sql`
    SELECT s.name, s.active_version, v.id, v.graph, v.validation_status
    FROM scenarios s
    JOIN scenario_versions v ON v.scenario_id = s.id AND v.tenant_id = s.tenant_id
    WHERE s.id = ${scenarioId} AND s.tenant_id = ${user.tenantId}
      AND v.version = ${input.version}
    LIMIT 1
  `) as Array<{ name: string; active_version: number | null; id: string; graph: ScenarioGraph; validation_status: string }>;
  const current = rows[0];
  if (!current) throw new AppError("scenario_not_found", 404, "Версия сценария не найдена.");
  if (current.active_version === input.version) return { version: input.version, alreadyPublished: true };
  const validation = validateScenarioGraph(current.graph);
  if (!validation.valid) throw new AppError("scenario_invalid", 422, validation.errors[0] || "Сценарий не прошёл проверку.");
  await sql.transaction([
    sql`
      UPDATE scenario_versions SET validation_status = 'valid', validation_errors = '[]'::jsonb,
        published_at = now(), published_by = ${user.id}, updated_at = now()
      WHERE id = ${current.id} AND tenant_id = ${user.tenantId}
    `,
    sql`
      UPDATE scenarios SET status = 'published', active_version = ${input.version}, updated_at = now()
      WHERE id = ${scenarioId} AND tenant_id = ${user.tenantId}
    `,
    sql`
      INSERT INTO audit_events (tenant_id, actor_user_id, action, resource_type, resource_id, metadata, ip_hash)
      VALUES (
        ${user.tenantId}, ${user.id}, 'scenario.published', 'scenario', ${scenarioId},
        ${JSON.stringify({ previousVersion: current.active_version, publishedVersion: input.version, requestId: context?.requestId, userAgent: context?.userAgent })}::jsonb,
        ${context?.ipHash || null}
      )
    `,
    sql`
      INSERT INTO outbox_events (tenant_id, topic, aggregate_type, aggregate_id, payload)
      VALUES (
        ${user.tenantId}, 'scenario.published', 'scenario', ${scenarioId},
        ${JSON.stringify({ scenarioId, version: input.version })}::jsonb
      )
    `,
  ]);
  return { version: input.version, alreadyPublished: false };
}

export async function testScenarioVersion(scenarioId: string, input: ScenarioTestInput, context?: AuditRequestContext) {
  const user = await requirePermission("scenarios.write");
  const sql = db();
  const rows = (await sql`
    SELECT graph FROM scenario_versions
    WHERE scenario_id = ${scenarioId} AND tenant_id = ${user.tenantId} AND version = ${input.version}
    LIMIT 1
  `) as Array<{ graph: ScenarioGraph }>;
  if (!rows[0]) throw new AppError("scenario_not_found", 404, "Версия сценария не найдена.");
  const result = simulateScenario(rows[0].graph, input.outcome);
  const executionId = randomUUID();
  await sql.transaction([
    sql`
      INSERT INTO scenario_executions (
        id, tenant_id, scenario_id, scenario_version, status, state, ended_at
      ) VALUES (
        ${executionId}, ${user.tenantId}, ${scenarioId}, ${input.version}, ${result.status},
        ${JSON.stringify({ mode: "simulation", outcome: input.outcome, visited: result.visited, validation: result.validation })}::jsonb,
        now()
      )
    `,
    sql`
      INSERT INTO audit_events (tenant_id, actor_user_id, action, resource_type, resource_id, metadata, ip_hash)
      VALUES (
        ${user.tenantId}, ${user.id}, 'scenario.tested', 'scenario', ${scenarioId},
        ${JSON.stringify({ version: input.version, outcome: input.outcome, result: result.status, executionId, requestId: context?.requestId, userAgent: context?.userAgent })}::jsonb,
        ${context?.ipHash || null}
      )
    `,
  ]);
  return { executionId, ...result };
}

export async function rollbackScenarioVersion(scenarioId: string, input: ScenarioRollbackInput, context?: AuditRequestContext) {
  const user = await requirePermission("scenarios.publish");
  const sql = db();
  const rows = (await sql`
    SELECT s.active_version, target.graph, target.validation_status,
      (SELECT max(version)::int FROM scenario_versions WHERE scenario_id = s.id AND tenant_id = s.tenant_id) AS latest_version
    FROM scenarios s
    JOIN scenario_versions target ON target.scenario_id = s.id AND target.tenant_id = s.tenant_id
    WHERE s.id = ${scenarioId} AND s.tenant_id = ${user.tenantId}
      AND target.version = ${input.targetVersion}
    LIMIT 1
  `) as Array<{ active_version: number | null; graph: ScenarioGraph; validation_status: string; latest_version: number }>;
  const current = rows[0];
  if (!current) throw new AppError("scenario_not_found", 404, "Версия для rollback не найдена.");
  const validation = validateScenarioGraph(current.graph);
  if (!validation.valid) throw new AppError("scenario_invalid", 422, "Выбранная версия больше не проходит актуальную safety-проверку.");
  const version = current.latest_version + 1;
  const versionId = randomUUID();
  try {
    await sql.transaction([
      sql`
        INSERT INTO scenario_versions (
          id, tenant_id, scenario_id, version, graph, validation_status,
          validation_errors, change_summary, created_by, published_at, published_by
        ) VALUES (
          ${versionId}, ${user.tenantId}, ${scenarioId}, ${version}, ${JSON.stringify(current.graph)}::jsonb,
          'valid', '[]'::jsonb, ${`Rollback к версии ${input.targetVersion}`}, ${user.id}, now(), ${user.id}
        )
      `,
      sql`UPDATE scenarios SET status = 'published', active_version = ${version}, updated_at = now() WHERE id = ${scenarioId} AND tenant_id = ${user.tenantId}`,
      sql`
        INSERT INTO audit_events (tenant_id, actor_user_id, action, resource_type, resource_id, metadata, ip_hash)
        VALUES (
          ${user.tenantId}, ${user.id}, 'scenario.rolled_back', 'scenario', ${scenarioId},
          ${JSON.stringify({ previousVersion: current.active_version, sourceVersion: input.targetVersion, publishedVersion: version, requestId: context?.requestId, userAgent: context?.userAgent })}::jsonb,
          ${context?.ipHash || null}
        )
      `,
      sql`
        INSERT INTO outbox_events (tenant_id, topic, aggregate_type, aggregate_id, payload)
        VALUES (
          ${user.tenantId}, 'scenario.published', 'scenario', ${scenarioId},
          ${JSON.stringify({ scenarioId, version, rollbackFrom: input.targetVersion })}::jsonb
        )
      `,
    ]);
    return { version };
  } catch (error) {
    if ((error as { code?: string }).code === "23505") throw new AppError("scenario_conflict", 409, "Появилась новая версия. Обновите страницу.");
    throw error;
  }
}
