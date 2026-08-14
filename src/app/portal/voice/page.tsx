import type { Metadata } from "next";
import {
  CheckCircle,
  Circle,
  ClockCounterClockwise,
  Phone,
  PlugsConnected,
  ShieldCheck,
} from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/portal/page-header";
import { PhoneNumberForm } from "@/components/portal/phone-number-form";
import { VoiceLab } from "@/components/portal/voice-lab";
import { getVoiceCenter } from "@/lib/dal/portal";
import { requirePageRoles } from "@/lib/dal/auth";

export const metadata: Metadata = { title: "Голос и телефония" };
export const dynamic = "force-dynamic";

function Status({ ready, children }: { ready: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-sm leading-6">
      {ready ? (
        <CheckCircle className="mt-1 size-4 shrink-0 text-primary" weight="fill" />
      ) : (
        <Circle className="mt-1 size-4 shrink-0 text-[#b18635]" />
      )}
      <span>{children}</span>
    </li>
  );
}

export default async function VoicePage() {
  await requirePageRoles(["clinic_admin", "operator"]);
  const data = await getVoiceCenter();
  const currentNumber = data.phoneNumbers[0];
  const phoneReady =
    data.configuration.openaiKey &&
    data.configuration.webhookSecret &&
    Boolean(data.configuration.projectId) &&
    currentNumber?.status === "active";
  const dateFormatter = new Intl.DateTimeFormat("ru-KZ", {
    timeZone: data.user.timezone,
    dateStyle: "short",
    timeStyle: "short",
  });

  return (
    <>
      <PageHeader
        eyebrow="Realtime speech-to-speech"
        title="Голос и телефония"
        description="Поговорите с AI Dos через Gemini Live, прослушайте запись и измерьте задержку. Реальная телефонная линия подключается отдельно через SIP."
      />
      <VoiceLab />

      <div className="mt-8 grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="rounded-[16px] border border-border bg-white/75 p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-[11px] bg-[#e6f2ec] text-primary">
              <Phone className="size-5" weight="fill" />
            </span>
            <div>
              <h2 className="font-semibold">Реальный телефонный номер</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Номер остаётся у выбранного SIP‑оператора; AI Dos принимает звонок через OpenAI SIP.
              </p>
            </div>
          </div>
          <div className="mt-6">
            <PhoneNumberForm
              existing={
                currentNumber
                  ? {
                      e164: String(currentNumber.e164),
                      label: String(currentNumber.label),
                      provider: String(currentNumber.provider),
                      voice: String(currentNumber.voice),
                      languages: currentNumber.languages as string[],
                      status: String(currentNumber.status),
                    }
                  : undefined
              }
            />
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-[15px] border border-border bg-white/75 p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Готовность линии</h2>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${phoneReady ? "bg-[#e0f2e8] text-primary" : "bg-[#fff3d9] text-[#7c5d13]"}`}
              >
                {phoneReady ? "Готова" : "Нужна настройка"}
              </span>
            </div>
            <ul className="mt-4 space-y-2">
              <Status ready={data.configuration.geminiKey}>Gemini Live · браузерный голос</Status>
              <Status ready={data.configuration.openaiKey}>OpenAI API key · SIP-телефон</Status>
              <Status ready={data.configuration.webhookSecret}>
                OpenAI webhook secret
              </Status>
              <Status ready={Boolean(data.configuration.projectId)}>
                OpenAI project ID
              </Status>
              <Status ready={Boolean(currentNumber)}>SIP‑номер клиники</Status>
              <Status ready={currentNumber?.status === "active"}>
                Линия активирована
              </Status>
            </ul>
          </section>

          <section className="rounded-[15px] border border-[#c8dfe2] bg-[#edf8fa] p-5 text-sm leading-6 text-[#2f5961]">
            <p className="flex items-center gap-2 font-semibold">
              <PlugsConnected className="size-4" /> SIP destination
            </p>
            <code className="mt-3 block break-all rounded-lg bg-white/65 p-3 text-xs">
              {data.configuration.sipUri || "Появится после OPENAI_PROJECT_ID"}
            </code>
            <p className="mt-3">
              Webhook: <span className="font-medium">/api/webhooks/openai/realtime</span>
            </p>
          </section>
        </aside>
      </div>

      <div className="mt-8 grid gap-5 xl:grid-cols-2">
        <section className="overflow-hidden rounded-[16px] border border-border bg-white/75">
          <div className="flex items-center gap-2 border-b border-border px-5 py-4 font-semibold">
            <ClockCounterClockwise className="size-5 text-primary" /> Последние голосовые тесты
          </div>
          {data.sessions.length ? (
            data.sessions.map((session) => (
              <article
                className="grid grid-cols-[1fr_auto] gap-3 border-b border-border/70 px-5 py-4 last:border-0"
                key={String(session.id)}
              >
                <div>
                  <p className="font-semibold">{String(session.voice)} · {String(session.model)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {dateFormatter.format(new Date(String(session.started_at)))} · {String(session.transcript_items)} реплик
                  </p>
                  {session.summary ? (
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-foreground/80">
                      {String(session.summary)}
                    </p>
                  ) : null}
                  {session.next_action ? (
                    <p className="mt-1 text-xs font-medium text-primary">
                      Следующий шаг: {String(session.next_action)}
                    </p>
                  ) : null}
                </div>
                <span className="text-sm font-semibold text-primary">
                  {session.latency_ms ? `${String(session.latency_ms)} мс` : String(session.status)}
                </span>
              </article>
            ))
          ) : (
            <p className="p-8 text-center text-sm text-muted-foreground">Запустите первый тест через микрофон.</p>
          )}
        </section>

        <section className="overflow-hidden rounded-[16px] border border-border bg-white/75">
          <div className="flex items-center gap-2 border-b border-border px-5 py-4 font-semibold">
            <ShieldCheck className="size-5 text-primary" /> Реальные звонки
          </div>
          {data.calls.length ? (
            data.calls.map((call) => (
              <article
                className="grid grid-cols-[1fr_auto] gap-3 border-b border-border/70 px-5 py-4 last:border-0"
                key={String(call.id)}
              >
                <div>
                  <p className="font-semibold">{String(call.from_number || "Скрытый номер")}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {dateFormatter.format(new Date(String(call.started_at)))} · {String(call.direction)}
                  </p>
                </div>
                <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold">
                  {String(call.status)}
                </span>
              </article>
            ))
          ) : (
            <p className="p-8 text-center text-sm text-muted-foreground">
              Здесь появятся входящие и исходящие звонки после подключения SIP‑номера.
            </p>
          )}
        </section>
      </div>
    </>
  );
}
