import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CampaignEditor } from "@/components/portal/campaign-editor";
import { getCampaignEditor } from "@/lib/dal/campaigns";

export const metadata: Metadata = { title: "Конструктор кампании" };
export const dynamic = "force-dynamic";

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getCampaignEditor(id);
  if (!data) notFound();
  const item = data.campaign;
  return (
    <CampaignEditor
      branches={data.branches.map((row) => ({ id: String(row.id), name: String(row.name) }))}
      campaign={{
        id: String(item.id), name: String(item.name), purpose: String(item.purpose),
        campaignType: String(item.campaign_type), channel: String(item.channel), locale: String(item.locale),
        status: String(item.status), audienceFilter: (item.audience_filter || {}) as Record<string, unknown>,
        subject: item.subject ? String(item.subject) : "", messageBody: String(item.message_body || ""),
        timezone: String(item.timezone), sendWindowStart: String(item.send_window_start).slice(0, 5),
        sendWindowEnd: String(item.send_window_end).slice(0, 5), dailyLimit: Number(item.daily_limit),
        periodDays: Number(item.period_days), maxContacts: Number(item.max_contacts),
        frequencyCapDays: Number(item.frequency_cap_days), revision: Number(item.revision),
        scheduledAt: item.scheduled_at ? new Date(String(item.scheduled_at)).toISOString() : null,
        results: (item.live_results || item.results || {}) as Record<string, number>,
      }}
      initialAudience={data.audience}
      initialProviderReady={data.providerReady}
      specialties={data.specialties.map((row) => ({ id: String(row.id), name: String(row.name) }))}
    />
  );
}
