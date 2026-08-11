import { config } from "./config.js";

/** Ровно то, что отдаёт `/api/mis/queue`: без ИИН и медицинских подробностей. */
export type QueueItem = {
  tenantId: string;
  attempts: number;
  appointmentId: string;
  patientFullName: string;
  patientPhone: string | null;
  patientBirthDate: string | null;
  doctorName: string;
  doctorExternalId: string | null;
  serviceName: string | null;
  startsAt: string;
  endsAt: string;
};

/** Контракт `/api/mis/results` — повторять его форму здесь нельзя вольно. */
export type SyncResult =
  | { status: "synced"; externalId: string; verified: boolean }
  | { status: "not_required" }
  | { status: "unavailable"; message: string }
  | { status: "failed"; errorCode: string; message: string; retryable: boolean };

function headers() {
  return {
    Authorization: `Bearer ${config.workerSecret}`,
    "Content-Type": "application/json",
  };
}

export async function fetchQueue(limit = config.batchLimit): Promise<QueueItem[]> {
  const response = await fetch(`${config.aiDosUrl}/api/mis/queue?limit=${limit}`, {
    headers: headers(),
  });
  const payload = (await response.json()) as {
    ok?: boolean;
    items?: QueueItem[];
    error?: { message?: string };
  };
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error?.message || `Очередь недоступна: HTTP ${response.status}`);
  }
  return payload.items || [];
}

export async function reportResults(
  results: Array<{ appointmentId: string; durationMs: number; result: SyncResult }>,
) {
  if (!results.length) return { applied: [], ignored: [] };
  const response = await fetch(`${config.aiDosUrl}/api/mis/results`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ results }),
  });
  const payload = (await response.json()) as {
    ok?: boolean;
    applied?: Array<{ appointmentId: string; state: string }>;
    ignored?: string[];
    error?: { message?: string };
  };
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error?.message || `Отчёт не принят: HTTP ${response.status}`);
  }
  return { applied: payload.applied || [], ignored: payload.ignored || [] };
}
