export type PatientTimelineEvent = {
  id: string;
  type: "call" | "conversation" | "appointment" | "notification" | "callback" | "waitlist" | "campaign" | "task" | "consent";
  timestamp: string;
  channel: string;
  status: string;
  title: string;
  detail: string | null;
  actor: string;
  branch: string | null;
  appointmentId: string | null;
  externalReference: string | null;
};

export function maskPatientPhone(value: unknown) {
  const phone = String(value || "").trim();
  if (!phone) return "Номер не указан";
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "••••";
  return `+${digits.slice(0, 1)} ••• ••• ${digits.slice(-2)}`;
}

export function safeTimelineText(value: unknown, max = 140) {
  return String(value || "")
    .replace(/\b\d{12}\b/g, "••••••••••••")
    .replace(/(?:\+?7|8)[\s()-]*\d{3}[\s()-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}/g, "+7 ••• ••• •• ••")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function sortTimeline(events: PatientTimelineEvent[]) {
  return [...events].sort(
    (left, right) =>
      new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime(),
  );
}
