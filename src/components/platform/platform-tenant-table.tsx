"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MagnifyingGlass, SpinnerGap } from "@phosphor-icons/react";
import { platformPlanLabel, platformSubscriptionLabel } from "@/lib/platform-labels";

export type PlatformTenantRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  plan: string;
  subscriptionStatus: string;
  usageTotal: string;
  integrationTotal: number;
  integrationReady: number;
  queuePending: number;
  queueFailed: number;
  lastActivity: string;
  protected: boolean;
};

const statusLabels: Record<string, string> = {
  active: "Активна",
  suspended: "Приостановлена",
  archived: "Архив",
};

function StatusDot({ status }: { status: string }) {
  const color = status === "active" ? "bg-[#16834d]" : status === "suspended" ? "bg-[#e99400]" : "bg-[#8a918d]";
  return <span aria-hidden className={`size-2 rounded-full ${color}`} />;
}

export function PlatformTenantTable({ rows }: { rows: PlatformTenantRow[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [pendingId, setPendingId] = useState("");
  const [message, setMessage] = useState("");
  const filtered = useMemo(() => rows.filter((row) => {
    const matchesQuery = `${row.name} ${row.slug}`.toLowerCase().includes(query.toLowerCase());
    return matchesQuery && (status === "all" || row.status === status);
  }), [query, rows, status]);

  async function toggle(row: PlatformTenantRow) {
    const next = row.status === "active" ? "suspended" : "active";
    const action = next === "active" ? "активировать" : "приостановить";
    if (!window.confirm(`Точно ${action} клинику «${row.name}»?`)) return;
    setPendingId(row.id);
    setMessage("");
    try {
      const response = await fetch(`/api/platform/tenants/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || "Не удалось изменить статус.");
      setMessage(`Статус «${row.name}» обновлён.`);
      router.refresh();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Нет связи с сервером.");
    } finally {
      setPendingId("");
    }
  }

  return (
    <section className="overflow-hidden rounded-[14px] border border-border bg-white/70" id="tenants">
      <div className="flex flex-col gap-3 border-b border-border px-5 py-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Клиники</h2>
          <p className="mt-1 text-xs text-muted-foreground">Tenant, подписка, usage и техническая готовность.</p>
        </div>
        <div className="flex gap-2">
          <label className="relative min-w-0 flex-1 md:w-64">
            <MagnifyingGlass className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              aria-label="Поиск клиники"
              className="h-10 w-full rounded-[8px] border border-input bg-white pl-9 pr-3 text-sm"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Поиск клиники…"
              value={query}
            />
          </label>
          <select
            aria-label="Фильтр статуса"
            className="h-10 rounded-[8px] border border-input bg-white px-3 text-sm"
            onChange={(event) => setStatus(event.target.value)}
            value={status}
          >
            <option value="all">Все статусы</option>
            <option value="active">Активные</option>
            <option value="suspended">Приостановленные</option>
            <option value="archived">Архив</option>
          </select>
        </div>
      </div>
      {message && <p className="border-b border-border bg-[#f1f7f3] px-5 py-3 text-sm text-primary" role="status">{message}</p>}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[900px] border-collapse text-left text-sm">
          <thead className="bg-[#f8f9f6] text-xs text-muted-foreground">
            <tr>{["Клиника", "Статус", "Тариф", "Usage", "Интеграции", "Очередь", "Последняя активность", ""].map((label) => <th className="px-4 py-3 font-medium" key={label}>{label}</th>)}</tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr className="border-t border-border/70" key={row.id}>
                <td className="px-4 py-4"><p className="font-semibold">{row.name}</p><p className="mt-1 max-w-40 truncate text-xs text-muted-foreground">{row.slug}</p></td>
                <td className="px-4 py-4"><span className="inline-flex items-center gap-2"><StatusDot status={row.status} />{statusLabels[row.status] || row.status}</span></td>
                <td className="px-4 py-4"><p className="font-medium">{platformPlanLabel(row.plan)}</p><p className="mt-1 text-xs text-muted-foreground">{platformSubscriptionLabel(row.subscriptionStatus)}</p></td>
                <td className="px-4 py-4 font-medium">{Number(row.usageTotal).toLocaleString("ru-KZ")}</td>
                <td className="px-4 py-4"><p>{row.integrationReady} / {row.integrationTotal}</p><p className="mt-1 text-xs text-muted-foreground">готовы</p></td>
                <td className="px-4 py-4"><p className={row.queueFailed ? "font-semibold text-[#b45309]" : ""}>{row.queuePending + row.queueFailed}</p><p className="mt-1 text-xs text-muted-foreground">{row.queueFailed ? `${row.queueFailed} ошибок` : "без ошибок"}</p></td>
                <td className="px-4 py-4 text-xs text-muted-foreground">{new Intl.DateTimeFormat("ru-KZ", { dateStyle: "medium", timeStyle: "short" }).format(new Date(row.lastActivity))}</td>
                <td className="px-4 py-4 text-right">
                  <button
                    className="inline-flex h-9 items-center justify-center rounded-[8px] border border-border px-3 text-xs font-semibold text-primary disabled:opacity-50"
                    disabled={row.protected || pendingId === row.id || row.status === "archived"}
                    onClick={() => toggle(row)}
                    title={row.protected ? "Tenant платформенного администратора защищён" : undefined}
                    type="button"
                  >
                    {pendingId === row.id && <SpinnerGap className="mr-2 size-4 animate-spin" />}
                    {row.status === "active" ? "Приостановить" : "Активировать"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="divide-y divide-border md:hidden">
        {filtered.map((row) => (
          <article className="space-y-3 p-4" key={row.id}>
            <div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{row.name}</p><p className="mt-1 text-xs text-muted-foreground">{row.slug}</p></div><span className="inline-flex items-center gap-2 text-sm"><StatusDot status={row.status} />{statusLabels[row.status]}</span></div>
            <div className="grid grid-cols-2 gap-3 text-sm"><p><span className="text-muted-foreground">Тариф:</span> {platformPlanLabel(row.plan)}</p><p><span className="text-muted-foreground">Usage:</span> {Number(row.usageTotal).toLocaleString("ru-KZ")}</p><p><span className="text-muted-foreground">Интеграции:</span> {row.integrationReady}/{row.integrationTotal}</p><p><span className="text-muted-foreground">Очередь:</span> {row.queuePending + row.queueFailed}</p></div>
            <button className="h-10 w-full rounded-[8px] border border-border text-sm font-semibold text-primary disabled:opacity-50" disabled={row.protected || pendingId === row.id || row.status === "archived"} onClick={() => toggle(row)} type="button">{row.status === "active" ? "Приостановить" : "Активировать"}</button>
          </article>
        ))}
      </div>
      {!filtered.length && <p className="px-5 py-12 text-center text-sm text-muted-foreground">Клиники не найдены.</p>}
    </section>
  );
}
