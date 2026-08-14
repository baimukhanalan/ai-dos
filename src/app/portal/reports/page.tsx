import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheck, Clock, DownloadSimple, Funnel, Phone, WarningCircle } from "@phosphor-icons/react/dist/ssr";

import { PageHeader } from "@/components/portal/page-header";
import { parseReportFilters, reportFiltersToParams } from "@/lib/analytics/reporting";
import { requirePageRoles } from "@/lib/dal/auth";
import { getAdvancedReport } from "@/lib/dal/reporting";

export const metadata: Metadata = { title: "Отчёты" };
export const dynamic = "force-dynamic";

const languageLabels: Record<string, string> = { ru: "Русский", kk: "Қазақша", en: "English" };
const channelLabels: Record<string, string> = { phone: "Телефон", web: "Сайт", whatsapp: "WhatsApp", telegram: "Telegram", portal: "Портал", mcp: "MCP", damumed: "DAMUMED" };
const resultLabels: Record<string, string> = { booked: "Записан", lost: "Не записан", escalated: "Передан оператору", confirmed: "Подтверждён", cancelled: "Отменён", completed: "Завершён", no_show: "Неявка" };
const pct = (value: number, total: number) => total ? Math.round(value / total * 100) : 0;

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePageRoles(["clinic_admin", "operator"]);
  const filters = parseReportFilters(await searchParams);
  const report = await getAdvancedReport(filters);
  const params = reportFiltersToParams(filters);
  const csv = new URLSearchParams(params); csv.set("format", "csv");
  const xlsx = new URLSearchParams(params); xlsx.set("format", "xlsx");
  const maxDaily = Math.max(...report.daily.map((row) => Math.max(row.calls, row.appointments)), 1);
  const cards = [
    { label: "Всего звонков", value: report.metrics.totalCalls, hint: `${report.metrics.answeredCalls} отвечено`, icon: Phone },
    { label: "Записей создано", value: report.metrics.appointments, hint: report.metrics.conversionRate === null ? "Нет звонков для расчёта" : `${Math.round(report.metrics.conversionRate * 100)}% от звонков`, icon: CalendarCheck },
    { label: "Средняя длительность", value: `${Math.floor(report.metrics.avgCallSeconds / 60)}:${String(report.metrics.avgCallSeconds % 60).padStart(2, "0")}`, hint: "Только завершённые звонки", icon: Clock },
    { label: "Пропущено", value: report.metrics.missedCalls, hint: `${pct(report.metrics.missedCalls, report.metrics.totalCalls)}% от звонков`, icon: WarningCircle },
  ];

  return <>
    <PageHeader eyebrow="Аналитика клиники" title="Отчёты" description={`Фактические данные ${report.clinic.name} · ${report.clinic.timezone}. Все срезы ограничены текущей клиникой.`} />

    <form className="mb-5 rounded-[16px] border border-border bg-white/75 p-4" method="get">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-[#193229]"><Funnel size={18} /> Фильтры отчёта</div>
        <div className="flex gap-2">
          <Link className="inline-flex items-center gap-2 rounded-[10px] border border-border bg-white px-3 py-2 text-sm font-medium" href={`/api/reports/export?${csv}`}><DownloadSimple size={16} />CSV</Link>
          <Link className="inline-flex items-center gap-2 rounded-[10px] bg-primary px-3 py-2 text-sm font-semibold text-white" href={`/api/reports/export?${xlsx}`}><DownloadSimple size={16} />XLSX</Link>
        </div>
      </div>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
        <FilterLabel title="С"><input className="report-input" defaultValue={filters.from} name="from" type="date" /></FilterLabel>
        <FilterLabel title="По"><input className="report-input" defaultValue={filters.to} name="to" type="date" /></FilterLabel>
        <FilterLabel title="Филиал"><select className="report-input" defaultValue={filters.branchId || ""} name="branchId"><option value="">Все филиалы</option>{report.options.branches.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></FilterLabel>
        <FilterLabel title="Врач"><select className="report-input" defaultValue={filters.doctorId || ""} name="doctorId"><option value="">Все врачи</option>{report.options.doctors.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></FilterLabel>
        <FilterLabel title="Специальность"><select className="report-input" defaultValue={filters.specialtyId || ""} name="specialtyId"><option value="">Все специальности</option>{report.options.specialties.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></FilterLabel>
        <FilterLabel title="Язык"><select className="report-input" defaultValue={filters.language || ""} name="language"><option value="">Все языки</option>{Object.entries(languageLabels).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select></FilterLabel>
        <FilterLabel title="Канал"><select className="report-input" defaultValue={filters.channel || ""} name="channel"><option value="">Все каналы</option>{Object.entries(channelLabels).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select></FilterLabel>
        <FilterLabel title="Результат"><select className="report-input" defaultValue={filters.result || ""} name="result"><option value="">Все результаты</option>{Object.entries(resultLabels).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select></FilterLabel>
        <FilterLabel title="Сценарий"><select className="report-input" defaultValue={filters.scenarioId || ""} name="scenarioId"><option value="">Все сценарии</option>{report.options.scenarios.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></FilterLabel>
        <div className="flex items-end gap-2"><button className="w-full rounded-[9px] bg-[#173d29] px-4 py-2 text-sm font-semibold text-white" type="submit">Применить</button><Link className="rounded-[9px] border border-border bg-white px-4 py-2 text-sm" href="/portal/reports">Сбросить</Link></div>
      </div>
    </form>

    <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map((item) => <article className="rounded-[15px] border border-border bg-white/75 p-5" key={item.label}><div className="flex justify-between"><p className="text-xs text-muted-foreground">{item.label}</p><item.icon className="text-primary" size={19} /></div><p className="mt-2 font-editorial text-4xl text-[#193229]">{item.value}</p><p className="mt-2 text-xs text-muted-foreground">{item.hint}</p></article>)}</div>

    <div className="mb-5 grid gap-5 xl:grid-cols-[1.7fr_0.7fr]">
      <section className="rounded-[16px] border border-border bg-white/75 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">Звонки и записи</h2><p className="mt-1 text-xs text-muted-foreground">Динамика по дням выбранного периода</p></div><div className="flex gap-4 text-xs text-muted-foreground"><Legend color="#173d29" label="Звонки" /><Legend color="#89b7a0" label="Записи" /></div></div>
        <div className="mt-6 flex h-52 items-end gap-1 overflow-hidden border-b border-l border-border px-2 pt-4">{report.daily.map((row) => <div className="flex h-full min-w-1 flex-1 items-end justify-center gap-px" key={row.day} title={`${row.day}: ${row.calls} звонков, ${row.appointments} записей`}><div className="w-[42%] rounded-t-sm bg-[#173d29]" style={{ height: `${Math.max(2, row.calls / maxDaily * 100)}%` }} /><div className="w-[42%] rounded-t-sm bg-[#89b7a0]" style={{ height: `${Math.max(2, row.appointments / maxDaily * 100)}%` }} /></div>)}</div>
        <div className="mt-2 flex justify-between text-[10px] text-muted-foreground"><span>{filters.from}</span><span>{filters.to}</span></div>
      </section>
      <section className="rounded-[16px] border border-border bg-[#edf6f2] p-5 sm:p-6"><h2 className="font-semibold text-[#173d29]">Операционная эффективность</h2><Efficiency label="Ответили на звонки" value={report.metrics.totalCalls ? pct(report.metrics.answeredCalls, report.metrics.totalCalls) : null} detail={`${report.metrics.answeredCalls} из ${report.metrics.totalCalls}`} /><Efficiency label="Доведено до визита" value={report.metrics.appointments ? pct(report.metrics.completed, report.metrics.appointments) : null} detail={`${report.metrics.completed} завершено`} /><Efficiency label="Лист ожидания" value={report.operations.waitlistOffers ? pct(report.operations.waitlistAccepted, report.operations.waitlistOffers) : null} detail={`${report.operations.waitlistAccepted} принято из ${report.operations.waitlistOffers}`} /><Efficiency label="Кампании" value={report.operations.campaignContacts ? pct(report.operations.campaignDelivered, report.operations.campaignContacts) : null} detail={`${report.operations.campaignDelivered} доставлено из ${report.operations.campaignContacts}`} /></section>
    </div>

    <div className="mb-5 grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
      <section className="overflow-hidden rounded-[16px] border border-border bg-white/75"><div className="border-b border-border px-5 py-4"><h2 className="font-semibold">Спрос по врачам</h2><p className="mt-1 text-xs text-muted-foreground">Записи по врачу, специальности и филиалу</p></div><div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="px-5 py-3 font-medium">Врач</th><th className="px-4 py-3 font-medium">Специальность</th><th className="px-4 py-3 font-medium">Филиал</th><th className="px-4 py-3 text-right font-medium">Записи</th><th className="px-5 py-3 text-right font-medium">Завершено</th></tr></thead><tbody>{report.demand.length ? report.demand.map((r) => <tr className="border-t border-border/60" key={`${r.doctor}-${r.branch}`}><td className="px-5 py-3 font-medium">{r.doctor}</td><td className="px-4 py-3 text-muted-foreground">{r.specialty}</td><td className="px-4 py-3 text-muted-foreground">{r.branch}</td><td className="px-4 py-3 text-right">{r.appointments}</td><td className="px-5 py-3 text-right">{r.completed}</td></tr>) : <tr><td className="px-5 py-8 text-center text-muted-foreground" colSpan={5}>За выбранный период записей нет.</td></tr>}</tbody></table></div></section>
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-1"><Breakdown title="Каналы" items={report.channels} labels={channelLabels} /><Breakdown title="Языки" items={report.languages} labels={languageLabels} /></div>
    </div>

    <section className="rounded-[16px] border border-border bg-white/75 p-5"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Mini label="Эскалации" value={report.operations.escalations} /><Mini label="Обратные звонки" value={`${report.operations.callbackDone}/${report.operations.callbackTotal}`} /><Mini label="Неявки" value={report.metrics.noShows} /><Mini label="Ошибки интеграций" value={report.operations.integrationErrors} /></div></section>
  </>;
}

function FilterLabel({ title, children }: { title: string; children: React.ReactNode }) { return <label className="text-xs text-muted-foreground">{title}{children}</label>; }
function Legend({ color, label }: { color: string; label: string }) { return <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />{label}</span>; }
function Efficiency({ label, value, detail }: { label: string; value: number | null; detail: string }) { return <div className="border-b border-border/70 py-3 last:border-0"><div className="flex items-baseline justify-between gap-3"><span className="text-sm text-muted-foreground">{label}</span><strong className="font-editorial text-2xl text-[#173d29]">{value === null ? "—" : `${value}%`}</strong></div><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>; }
function Breakdown({ title, items, labels }: { title: string; items: Array<{ key: string; count: number }>; labels: Record<string, string> }) { const total = items.reduce((sum, x) => sum + x.count, 0); return <section className="rounded-[16px] border border-border bg-white/75 p-5"><h2 className="font-semibold">{title}</h2><div className="mt-4 space-y-3">{items.length ? items.map((x) => <div key={x.key}><div className="flex justify-between text-sm"><span>{labels[x.key] || x.key}</span><b>{pct(x.count, total)}%</b></div><div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-[#78ad95]" style={{ width: `${pct(x.count, total)}%` }} /></div></div>) : <p className="text-sm text-muted-foreground">Данных за период нет.</p>}</div></section>; }
function Mini({ label, value }: { label: string; value: string | number }) { return <div className="rounded-[12px] bg-muted/50 p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 font-editorial text-3xl text-[#193229]">{value}</p></div>; }
