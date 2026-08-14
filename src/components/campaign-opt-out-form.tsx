"use client";

import { useState } from "react";
import { CheckCircle, SpinnerGap } from "@phosphor-icons/react";

export function CampaignOptOutForm({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/public/campaign-opt-out", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }),
      });
      const payload = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message || "Не удалось сохранить отказ.");
      setDone(true);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Не удалось сохранить отказ."); }
    finally { setBusy(false); }
  }

  if (done) return <div className="rounded-[12px] border border-[#b9d9c8] bg-[#f2faf6] p-5 text-sm leading-6 text-[#214f3e]"><CheckCircle className="mb-3 size-6" weight="fill" />Отказ сохранён. Необязательные маркетинговые кампании больше не будут вам отправляться.</div>;
  return <div><button className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-[9px] bg-primary px-5 text-sm font-semibold text-white disabled:opacity-50" disabled={busy} onClick={submit} type="button">{busy && <SpinnerGap className="size-4 animate-spin" />}Отказаться от кампаний</button>{error && <p className="mt-3 text-sm text-destructive" role="alert">{error}</p>}</div>;
}
