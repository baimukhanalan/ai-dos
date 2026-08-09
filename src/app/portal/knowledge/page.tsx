import type { Metadata } from "next";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import {
  BookOpenText,
  CheckCircle,
} from "@phosphor-icons/react/dist/ssr";
import { KnowledgeCreateForm } from "@/components/portal/knowledge-create-form";
import { RuleCreateForm } from "@/components/portal/rule-create-form";
import { PageHeader } from "@/components/portal/page-header";
import { getKnowledge } from "@/lib/dal/portal";
import { getKnowledgeRulesForPortal } from "@/lib/dal/knowledge-rules";
import { ruleCategoryLabels, type RuleCategory } from "@/lib/ai/knowledge-rules";

export const metadata: Metadata = { title: "База знаний" };
export const dynamic = "force-dynamic";

export default async function KnowledgePage() {
  const [{ articles }, { rules }] = await Promise.all([
    getKnowledge(),
    getKnowledgeRulesForPortal(),
  ]);
  return (
    <>
      <PageHeader
        eyebrow="Утверждённые ответы"
        title="База знаний"
        description="Опубликованные материалы автоматически входят в контекст чата и Gemini Live. Для актуальных данных AI дополнительно обращается к этой базе во время разговора."
      >
        <div className="flex flex-wrap gap-2">
          <KnowledgeCreateForm />
          <RuleCreateForm />
        </div>
      </PageHeader>

      <section className="mb-6 rounded-[16px] border border-border bg-white/70 p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Структурированные правила клиники</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Адресные правила (расписание, подготовка, ОСМС, исключения). AI достаёт нужное правило под конкретное обращение, а не держит один огромный промпт.
            </p>
          </div>
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">{rules.length}</span>
        </div>
        {rules.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {rules.map((rule) => (
              <article className="rounded-[12px] border border-border/70 bg-white p-4" key={String(rule.id)}>
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded-full bg-[#e5f2eb] px-2.5 py-1 text-[10px] font-semibold uppercase text-primary">
                    {ruleCategoryLabels[rule.category as RuleCategory] || String(rule.category)}
                  </span>
                  <span className="text-[10px] uppercase text-muted-foreground">{String(rule.locale)}</span>
                </div>
                <h3 className="mt-3 text-sm font-semibold">{String(rule.title)}</h3>
                <p className="mt-2 line-clamp-3 text-xs leading-5 text-muted-foreground">{String(rule.body)}</p>
                {rule.keywords?.length ? (
                  <p className="mt-2 text-[11px] text-muted-foreground">#{rule.keywords.join(" #")}</p>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <p className="rounded-[12px] border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Правил пока нет. Добавьте первое — например, «Опоздание более 15 минут» или «Подготовка к УЗИ брюшной полости».
          </p>
        )}
      </section>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {articles.length ? (
          articles.map((article) => (
            <article
              className="flex min-h-[250px] flex-col rounded-[15px] border border-border bg-white/70 p-5"
              key={String(article.id)}
            >
              <div className="flex items-start justify-between gap-3">
                <BookOpenText className="size-6 text-primary" />
                {article.status === "published" ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e5f2eb] px-2.5 py-1 text-[10px] font-semibold uppercase text-primary">
                    <CheckCircle className="size-3.5" weight="fill" /> В AI Dos
                  </span>
                ) : (
                  <span className="inline-flex rounded-full bg-muted px-2.5 py-1 text-[10px] font-semibold uppercase text-muted-foreground">
                    {String(article.status)}
                  </span>
                )}
              </div>
              <h2 className="mt-3 text-lg font-semibold">
                {String(article.title)}
              </h2>
              <p className="mt-3 line-clamp-4 whitespace-pre-line text-sm leading-6 text-muted-foreground">
                {String(article.content || "Содержание версии отсутствует.")}
              </p>
              <p className="mt-auto pt-5 text-xs text-muted-foreground">
                Версий: {String(article.version_count)} · обновлено{" "}
                {format(new Date(String(article.updated_at)), "d MMM yyyy", {
                  locale: ru,
                })}
                {article.locale ? ` · ${String(article.locale).toUpperCase()}` : ""}
              </p>
            </article>
          ))
        ) : (
          <div className="col-span-full rounded-[15px] border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
            База знаний пуста. Добавьте первую утверждённую статью.
          </div>
        )}
      </div>
    </>
  );
}
