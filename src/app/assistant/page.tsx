import type { Metadata } from "next";
import { PublicAssistant } from "@/components/public/public-assistant";
import { resolvePublicTenant } from "@/lib/dal/operations";

export const metadata: Metadata = {
  title: "Запись в клинику",
  description: "Публичный чат AI Dos для выбора врача и записи на приём.",
};
export const dynamic = "force-dynamic";

export default async function AssistantPage() {
  const tenant = await resolvePublicTenant();
  return <PublicAssistant clinicName={tenant.name} />;
}
