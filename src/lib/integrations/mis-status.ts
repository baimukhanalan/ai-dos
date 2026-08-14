export type MisIntegrationStatus =
  | "sandbox"
  | "official_api_pending"
  | "approved_bridge_ready"
  | "approved_bridge_setup_required";

export function misIntegrationStatus(
  mode = process.env.MIS_ADAPTER,
  workerSecret = process.env.MIS_WORKER_SECRET,
  workerTenantId = process.env.MIS_WORKER_TENANT_ID,
): MisIntegrationStatus {
  if (mode === "remote") {
    return workerSecret && workerTenantId
      ? "approved_bridge_ready"
      : "approved_bridge_setup_required";
  }
  if (mode === "damumed") return "official_api_pending";
  return "sandbox";
}

export function misIntegrationLabel(status: MisIntegrationStatus) {
  if (status === "approved_bridge_ready") return "Одобренный мост подключён";
  if (status === "approved_bridge_setup_required") return "Мост требует настройки";
  if (status === "official_api_pending") return "Ожидает официальный API";
  return "Sandbox AI Dos";
}
