import type { Metadata } from "next";
import { Brand } from "@/components/brand";
import { CampaignOptOutForm } from "@/components/campaign-opt-out-form";
import { getCampaignOptOutStatus } from "@/lib/dal/campaign-opt-out";

export const metadata: Metadata = { title: "Отказ от сообщений" };
export const dynamic = "force-dynamic";

export default async function OptOutPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  const status = await getCampaignOptOutStatus(token);
  return <main className="min-h-screen bg-[#fbfaf6] px-5 py-8"><div className="mx-auto max-w-[560px]"><Brand className="text-[28px]" href="/" /><section className="mt-16 rounded-[18px] border border-border bg-white p-6 sm:p-8"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Управление согласиями</p><h1 className="mt-3 font-editorial text-[clamp(2.1rem,7vw,3.5rem)] leading-none">Отказ от сообщений</h1>{status.valid ? <><p className="mt-5 text-sm leading-6 text-muted-foreground">Вы можете отказаться от необязательных исходящих кампаний{status.campaignName ? `, включая «${status.campaignName}»` : ""}. Записи, сервисные подтверждения и важные сообщения клиники это не отключит.</p><div className="mt-6"><CampaignOptOutForm token={token} /></div></> : <p className="mt-5 rounded-[10px] bg-muted p-4 text-sm leading-6 text-muted-foreground">Ссылка недействительна, истекла или уже была использована. Если сообщения продолжают приходить, обратитесь в клинику.</p>}</section></div></main>;
}
