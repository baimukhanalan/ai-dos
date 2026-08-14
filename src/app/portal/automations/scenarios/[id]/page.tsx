import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ScenarioEditor } from "@/components/portal/scenario-editor";
import { getScenarioEditor } from "@/lib/dal/scenarios";

export const metadata: Metadata = { title: "Редактор сценария" };
export const dynamic = "force-dynamic";

export default async function ScenarioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getScenarioEditor(id);
  if (!data) notFound();
  return (
    <ScenarioEditor
      activeVersion={data.scenario.active_version}
      initialGraph={data.current.graph}
      initialName={data.scenario.name}
      initialRevision={data.current.revision}
      initialVersion={data.current.version}
      scenarioId={data.scenario.id}
      status={data.scenario.status}
      triggerKind={data.scenario.trigger_kind}
      versions={data.versions.map((item) => ({
        version: item.version,
        revision: item.revision,
        validationStatus: item.validation_status,
        changeSummary: item.change_summary,
        publishedAt: item.published_at ? new Date(item.published_at).toISOString() : null,
        createdAt: new Date(item.created_at).toISOString(),
        createdBy: item.created_by_name || null,
      }))}
    />
  );
}
