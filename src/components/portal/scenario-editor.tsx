"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowCounterClockwise,
  ArrowDown,
  CheckCircle,
  FloppyDisk,
  Minus,
  Play,
  Plus,
  SpinnerGap,
  Trash,
  WarningCircle,
} from "@phosphor-icons/react";
import {
  scenarioNodeTypes,
  scenarioToolNames,
  validateScenarioGraph,
  type ScenarioGraph,
  type ScenarioNode,
} from "@/lib/scenarios/graph";

type VersionSummary = {
  version: number;
  revision: number;
  validationStatus: string;
  changeSummary: string | null;
  publishedAt: string | null;
  createdAt: string;
  createdBy: string | null;
};

type Props = {
  scenarioId: string;
  initialName: string;
  triggerKind: string;
  status: string;
  activeVersion: number | null;
  initialVersion: number;
  initialRevision: number;
  initialGraph: ScenarioGraph;
  versions: VersionSummary[];
};

const typeLabels: Record<(typeof scenarioNodeTypes)[number], string> = {
  trigger: "Триггер",
  intent: "Намерение",
  condition: "Условие",
  question: "Вопрос",
  confirmation: "Подтверждение",
  action: "Действие",
  api_call: "API-вызов",
  branch: "Ветвление",
  wait: "Ожидание",
  transfer: "Передача",
  notification: "Уведомление",
  webhook: "Webhook",
  error_handler: "Обработка ошибки",
  fallback: "Fallback",
  end: "Конец",
};

const typeStyles: Record<string, string> = {
  trigger: "border-[#a8d8c3] bg-[#f2faf6]",
  intent: "border-[#d8c7ec] bg-[#faf7fd]",
  question: "border-[#8eb9e7] bg-[#f4f8fd]",
  confirmation: "border-[#8eb9e7] bg-[#f4f8fd]",
  action: "border-[#edc57e] bg-[#fffaf0]",
  api_call: "border-[#edc57e] bg-[#fffaf0]",
  notification: "border-[#a8d8c3] bg-[#f2faf6]",
  transfer: "border-[#efaaa4] bg-[#fff6f5]",
  fallback: "border-[#efaaa4] bg-[#fff6f5]",
  error_handler: "border-[#efaaa4] bg-[#fff6f5]",
  end: "border-[#b9d9c8] bg-[#f4faf6]",
};

const toolLabels: Record<string, string> = {
  identifyPatient: "Идентифицировать пациента",
  verifyIIN: "Проверить ИИН",
  searchPatient: "Найти пациента",
  searchDoctor: "Найти врача",
  searchService: "Найти услугу",
  getAvailableSlots: "Получить свободные окна",
  createAppointment: "Создать запись",
  rescheduleAppointment: "Перенести запись",
  cancelAppointment: "Отменить запись",
  addToWaitlist: "Добавить в лист ожидания",
  createUrgentRequest: "Создать срочный запрос",
  createCallback: "Создать callback",
  sendConfirmation: "Отправить подтверждение",
  transferToHuman: "Передать сотруднику",
  queryKnowledgeBase: "Запросить базу знаний",
};

const toolTypes = new Set(["action", "api_call", "notification", "webhook", "transfer", "fallback", "error_handler"]);

function graphLevels(graph: ScenarioGraph) {
  const incoming = new Map(graph.nodes.map((node) => [node.id, 0]));
  for (const edge of graph.edges) incoming.set(edge.to, (incoming.get(edge.to) || 0) + 1);
  const trigger = graph.nodes.find((node) => node.type === "trigger") || graph.nodes.find((node) => incoming.get(node.id) === 0);
  const depth = new Map<string, number>();
  if (trigger) depth.set(trigger.id, 0);
  for (let pass = 0; pass < graph.nodes.length; pass += 1) {
    for (const edge of graph.edges) {
      const fromDepth = depth.get(edge.from);
      if (fromDepth !== undefined) depth.set(edge.to, Math.max(depth.get(edge.to) || 0, fromDepth + 1));
    }
  }
  const maxDepth = Math.max(0, ...depth.values());
  return Array.from({ length: maxDepth + 1 }, (_, level) =>
    graph.nodes.filter((node) => depth.get(node.id) === level),
  ).filter((level) => level.length);
}

function NodeCard({ node, selected, onSelect }: { node: ScenarioNode; selected: boolean; onSelect: () => void }) {
  return (
    <button
      className={`relative w-full max-w-[300px] rounded-[10px] border px-4 py-3 text-left transition ${typeStyles[node.type] || "border-border bg-white"} ${selected ? "ring-2 ring-primary ring-offset-2" : "hover:border-primary/50"}`}
      onClick={onSelect}
      type="button"
    >
      <span className="block truncate text-sm font-semibold text-[#17241f]">{node.label}</span>
      <span className="mt-1 block text-[11px] text-muted-foreground">{typeLabels[node.type]}</span>
      {selected && <span className="absolute -right-1.5 top-1/2 size-3 -translate-y-1/2 rounded-full bg-primary" />}
    </button>
  );
}

export function ScenarioEditor(props: Props) {
  const [name, setName] = useState(props.initialName);
  const [graph, setGraph] = useState(props.initialGraph);
  const [version, setVersion] = useState(props.initialVersion);
  const [revision, setRevision] = useState(props.initialRevision);
  const [selectedId, setSelectedId] = useState(props.initialGraph.nodes.find((node) => node.type === "question")?.id || props.initialGraph.nodes[0]?.id || "");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<"save" | "test" | "publish" | "rollback" | "">("");
  const [message, setMessage] = useState("");
  const [testResult, setTestResult] = useState<{ status: string; visited: Array<{ id: string; label: string }> } | null>(null);
  const [zoom, setZoom] = useState(100);
  const validation = useMemo(() => validateScenarioGraph(graph), [graph]);
  const levels = useMemo(() => graphLevels(graph), [graph]);
  const selected = graph.nodes.find((node) => node.id === selectedId) || null;
  const hasDraft = props.activeVersion !== version;

  function changeGraph(updater: (current: ScenarioGraph) => ScenarioGraph) {
    setGraph((current) => updater(current));
    setDirty(true);
    setMessage("");
  }

  function updateSelected(patch: Partial<ScenarioNode>) {
    if (!selected) return;
    changeGraph((current) => ({
      ...current,
      nodes: current.nodes.map((node) => node.id === selected.id ? { ...node, ...patch } : node),
    }));
  }

  function updateConfig(patch: Partial<ScenarioNode["config"]>) {
    if (!selected) return;
    updateSelected({ config: { ...selected.config, ...patch } });
  }

  function addBlock(type: (typeof scenarioNodeTypes)[number]) {
    if (!selected || selected.type === "end") {
      setMessage("Сначала выберите блок, после которого нужно добавить новый.");
      return;
    }
    const id = `${type}-${crypto.randomUUID().slice(0, 8)}`;
    const firstOutgoing = graph.edges.find((edge) => edge.from === selected.id);
    const defaultTool = ["transfer", "fallback", "error_handler"].includes(type)
      ? "transferToHuman"
      : type === "notification"
        ? "sendConfirmation"
        : "queryKnowledgeBase";
    const node: ScenarioNode = {
      id,
      type,
      label: typeLabels[type],
      config: toolTypes.has(type) ? { locale: "auto", tool: defaultTool as ScenarioNode["config"]["tool"] } : { locale: "auto" },
    };
    changeGraph((current) => ({
      nodes: [...current.nodes, node],
      edges: [
        ...current.edges.filter((edge) => edge.id !== firstOutgoing?.id),
        { id: `edge-${crypto.randomUUID().slice(0, 8)}`, from: selected.id, to: id },
        ...(firstOutgoing ? [{ ...firstOutgoing, id: `edge-${crypto.randomUUID().slice(0, 8)}`, from: id }] : []),
      ],
    }));
    setSelectedId(id);
  }

  function deleteSelected() {
    if (!selected || ["trigger", "end"].includes(selected.type)) return;
    if (!window.confirm(`Удалить блок «${selected.label}»?`)) return;
    const incoming = graph.edges.filter((edge) => edge.to === selected.id);
    const outgoing = graph.edges.filter((edge) => edge.from === selected.id);
    changeGraph((current) => ({
      nodes: current.nodes.filter((node) => node.id !== selected.id),
      edges: [
        ...current.edges.filter((edge) => edge.from !== selected.id && edge.to !== selected.id),
        ...(outgoing[0] ? incoming.map((edge) => ({ ...edge, id: `edge-${crypto.randomUUID().slice(0, 8)}`, to: outgoing[0].to })) : []),
      ],
    }));
    setSelectedId(graph.nodes.find((node) => node.type === "trigger")?.id || "");
  }

  async function request(path: string, body: unknown, method = "POST") {
    const response = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json() as { data?: Record<string, unknown>; error?: { message?: string } };
    if (!response.ok) throw new Error(payload.error?.message || "Операция не выполнена.");
    return payload.data || {};
  }

  async function save() {
    setBusy("save");
    setMessage("");
    try {
      const data = await request(`/api/automations/scenarios/${props.scenarioId}`, {
        name,
        expectedVersion: version,
        expectedRevision: revision,
        graph,
        changeSummary: "Изменения в визуальном редакторе",
      }, "PATCH");
      setVersion(Number(data.version));
      setRevision(Number(data.revision));
      setDirty(false);
      setMessage(validation.valid ? "Все изменения сохранены." : "Черновик сохранён, но требует исправлений.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить сценарий.");
    } finally {
      setBusy("");
    }
  }

  async function test(outcome: "success" | "fallback") {
    if (dirty) {
      setMessage("Сначала сохраните изменения, затем запустите тест.");
      return;
    }
    setBusy("test");
    try {
      const data = await request(`/api/automations/scenarios/${props.scenarioId}/test`, { version, outcome });
      setTestResult(data as unknown as { status: string; visited: Array<{ id: string; label: string }> });
      setMessage(data.status === "failed" ? "Симуляция выявила ошибку." : "Симуляция завершена и записана в журнал.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось запустить тест.");
    } finally {
      setBusy("");
    }
  }

  async function publish() {
    if (dirty) {
      setMessage("Сначала сохраните изменения.");
      return;
    }
    if (!validation.valid) {
      setMessage(validation.errors[0] || "Исправьте ошибки проверки.");
      return;
    }
    if (!window.confirm(`Опубликовать версию ${version}? Она станет активной для новых разговоров.`)) return;
    setBusy("publish");
    try {
      await request(`/api/automations/scenarios/${props.scenarioId}/publish`, { version, confirmed: true });
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось опубликовать сценарий.");
      setBusy("");
    }
  }

  async function rollback(targetVersion: number) {
    if (!window.confirm(`Вернуть сценарий к версии ${targetVersion}? Будет создана новая опубликованная версия.`)) return;
    setBusy("rollback");
    try {
      await request(`/api/automations/scenarios/${props.scenarioId}/rollback`, { targetVersion, confirmed: true });
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Rollback не выполнен.");
      setBusy("");
    }
  }

  return (
    <div className="-mx-4 -my-7 min-h-[calc(100vh-76px)] sm:-mx-7 lg:-mx-9 lg:-my-9">
      <header className="flex flex-col gap-4 border-b border-border bg-[#fbfaf6] px-5 py-5 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <Link className="text-xs font-semibold text-primary hover:underline" href="/portal/automations">← Автоматизация</Link>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <input
              aria-label="Название сценария"
              className="min-w-0 flex-1 bg-transparent font-editorial text-[clamp(2rem,3vw,3rem)] leading-none text-[#17241f] outline-none xl:min-w-[520px]"
              onChange={(event) => { setName(event.target.value); setDirty(true); }}
              value={name}
            />
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${hasDraft ? "border-[#e7c98d] bg-[#fff8e8] text-[#9b5b00]" : "border-[#b9d9c8] bg-[#f2faf6] text-primary"}`}>{hasDraft ? "Черновик" : "Опубликован"}</span>
            <span className="rounded-full border border-border bg-white px-3 py-1 text-xs font-semibold text-muted-foreground">Версия {version}</span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Триггер: {props.triggerKind} · активная версия: {props.activeVersion || "не опубликована"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="inline-flex h-10 items-center gap-2 rounded-[9px] border border-primary bg-white px-4 text-sm font-semibold text-primary disabled:opacity-50" disabled={Boolean(busy)} onClick={() => test("success")} type="button"><Play className="size-4" />Тестировать</button>
          <button className="inline-flex h-10 items-center gap-2 rounded-[9px] bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50" disabled={Boolean(busy)} onClick={publish} type="button">{busy === "publish" ? <SpinnerGap className="size-4 animate-spin" /> : <CheckCircle className="size-4" />}Опубликовать</button>
        </div>
      </header>

      <div className="flex flex-col border-b border-border bg-white/75 px-5 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <details className="relative">
            <summary className="inline-flex h-9 cursor-pointer list-none items-center gap-2 rounded-[8px] border border-primary px-3 text-sm font-semibold text-primary"><Plus className="size-4" />Добавить блок</summary>
            <div className="absolute left-0 z-30 mt-2 grid w-72 grid-cols-2 gap-1 rounded-[10px] border border-border bg-white p-2 shadow-lg">
              {scenarioNodeTypes.filter((type) => !["trigger", "end"].includes(type)).map((type) => <button className="rounded-[7px] px-2 py-2 text-left text-xs hover:bg-muted" key={type} onClick={() => addBlock(type)} type="button">{typeLabels[type]}</button>)}
            </div>
          </details>
          <button className="inline-flex h-9 items-center gap-2 rounded-[8px] border border-border px-3 text-sm font-semibold" onClick={() => setMessage(validation.valid ? "Проверка пройдена." : validation.errors[0])} type="button"><CheckCircle className="size-4" />Проверить</button>
          <button className="inline-flex h-9 items-center gap-2 rounded-[8px] border border-border px-3 text-sm font-semibold disabled:opacity-50" disabled={!dirty || Boolean(busy)} onClick={save} type="button">{busy === "save" ? <SpinnerGap className="size-4 animate-spin" /> : <FloppyDisk className="size-4" />}Сохранить</button>
          <span className="hidden h-6 border-l border-border sm:block" />
          <button aria-label="Уменьшить масштаб" className="flex size-9 items-center justify-center rounded-[8px] border border-border disabled:opacity-40" disabled={zoom <= 80} onClick={() => setZoom((value) => Math.max(80, value - 10))} type="button"><Minus className="size-4" /></button>
          <span className="text-xs font-semibold text-muted-foreground">{zoom}%</span>
          <button aria-label="Увеличить масштаб" className="flex size-9 items-center justify-center rounded-[8px] border border-border disabled:opacity-40" disabled={zoom >= 120} onClick={() => setZoom((value) => Math.min(120, value + 10))} type="button"><Plus className="size-4" /></button>
        </div>
        <p className={`mt-2 inline-flex items-center gap-2 text-xs font-medium lg:mt-0 ${dirty ? "text-[#9b5b00]" : "text-primary"}`}>{dirty ? <WarningCircle className="size-4" /> : <CheckCircle className="size-4" />}{dirty ? "Есть несохранённые изменения" : "Все изменения сохранены"}</p>
      </div>

      {message && <div className="border-b border-border bg-[#f4f8f5] px-5 py-3 text-sm text-[#294b3e]" role="status">{message}</div>}

      <div className="grid min-h-[720px] bg-white xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="relative min-h-[720px] overflow-auto bg-[radial-gradient(#d7ddd8_0.7px,transparent_0.7px)] bg-[size:18px_18px] px-5 py-8" aria-label="Граф сценария">
          <div className="mx-auto flex w-full max-w-[760px] flex-col items-center transition-transform" style={{ transform: `scale(${zoom / 100})`, transformOrigin: "top center" }}>
            {levels.map((level, levelIndex) => (
              <div className="contents" key={`level-${levelIndex}`}>
                {levelIndex > 0 && (
                  <div className="flex h-12 flex-col items-center justify-center">
                    <span className="h-7 border-l border-[#99a69f]" />
                    <span className="flex size-5 items-center justify-center rounded-full border border-[#99a69f] bg-white"><ArrowDown className="size-3 text-[#718078]" /></span>
                  </div>
                )}
                <div className={`grid w-full justify-items-center gap-8 ${level.length > 1 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"}`}>
                  {level.map((node) => <NodeCard key={node.id} node={node} onSelect={() => setSelectedId(node.id)} selected={selectedId === node.id} />)}
                </div>
                {level.length > 1 && <div className="mt-2 flex w-2/3 justify-between text-[10px] text-muted-foreground"><span>{graph.edges.find((edge) => edge.to === level[0].id)?.label || "Ветка 1"}</span><span>{graph.edges.find((edge) => edge.to === level.at(-1)?.id)?.label || "Ветка 2"}</span></div>}
              </div>
            ))}
          </div>
        </section>

        <aside className="border-l border-border bg-[#fbfaf7] p-5" aria-label="Настройки блока">
          {selected ? (
            <div className="space-y-5">
              <div className="border-b border-border pb-4"><h2 className="font-editorial text-2xl">{selected.label}</h2><p className="mt-1 text-xs text-muted-foreground">Настройки выбранного блока</p></div>
              <label className="block text-sm font-semibold">Тип блока<input className="mt-2 h-10 w-full rounded-[8px] border border-input bg-muted px-3 text-sm" disabled value={typeLabels[selected.type]} /></label>
              <label className="block text-sm font-semibold">Название блока<input className="mt-2 h-10 w-full rounded-[8px] border border-input bg-white px-3 text-sm" maxLength={120} onChange={(event) => updateSelected({ label: event.target.value })} value={selected.label} /></label>
              {["question", "confirmation", "condition", "wait", "intent"].includes(selected.type) && <label className="block text-sm font-semibold">Текст или инструкция<textarea className="mt-2 min-h-28 w-full rounded-[8px] border border-input bg-white p-3 text-sm" maxLength={1200} onChange={(event) => updateConfig({ text: event.target.value })} value={selected.config.text || ""} /></label>}
              <label className="block text-sm font-semibold">Язык<select className="mt-2 h-10 w-full rounded-[8px] border border-input bg-white px-3 text-sm" onChange={(event) => updateConfig({ locale: event.target.value as "auto" | "ru" | "kk" | "en" })} value={selected.config.locale || "auto"}><option value="auto">Определять автоматически</option><option value="ru">Русский</option><option value="kk">Қазақша</option><option value="en">English</option></select></label>
              {toolTypes.has(selected.type) && <label className="block text-sm font-semibold">Разрешённый tool<select className="mt-2 h-10 w-full rounded-[8px] border border-input bg-white px-3 text-sm" disabled={["transfer", "fallback", "error_handler"].includes(selected.type)} onChange={(event) => updateConfig({ tool: event.target.value as ScenarioNode["config"]["tool"] })} value={selected.config.tool || (["transfer", "fallback", "error_handler"].includes(selected.type) ? "transferToHuman" : "queryKnowledgeBase")}>{scenarioToolNames.map((tool) => <option key={tool} value={tool}>{toolLabels[tool] || tool}</option>)}</select></label>}
              {["intent", "question", "confirmation"].includes(selected.type) && <label className="block text-sm font-semibold">При низкой уверенности<select className="mt-2 h-10 w-full rounded-[8px] border border-input bg-white px-3 text-sm" onChange={(event) => updateConfig({ onLowConfidence: event.target.value as "clarify" | "transfer" })} value={selected.config.onLowConfidence || "clarify"}><option value="clarify">Уточнить повторно</option><option value="transfer">Передать регистратору</option></select></label>}
              {selected.type === "wait" && <label className="block text-sm font-semibold">Время ожидания, секунд<input className="mt-2 h-10 w-full rounded-[8px] border border-input bg-white px-3 text-sm" max={3600} min={1} onChange={(event) => updateConfig({ waitSeconds: Number(event.target.value) })} type="number" value={selected.config.waitSeconds || 30} /></label>}
              <button className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-[8px] bg-primary text-sm font-semibold text-white disabled:opacity-50" disabled={!dirty || Boolean(busy)} onClick={save} type="button"><FloppyDisk className="size-4" />Сохранить блок</button>
              <button className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-[8px] border border-destructive text-sm font-semibold text-destructive disabled:opacity-40" disabled={["trigger", "end"].includes(selected.type)} onClick={deleteSelected} type="button"><Trash className="size-4" />Удалить блок</button>
            </div>
          ) : <p className="py-12 text-center text-sm text-muted-foreground">Выберите блок на canvas.</p>}
        </aside>
      </div>

      <section className="border-t border-border bg-[#fbfaf7] px-5 py-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div><h2 className="font-editorial text-xl">Проверка сценария</h2><p className="mt-1 text-xs text-muted-foreground">Safety-гейты выполняются до публикации.</p></div>
          <div className="grid flex-1 gap-2 sm:grid-cols-2 xl:max-w-4xl xl:grid-cols-5">
            {validation.checks.map((check) => <div className="flex items-center gap-2 rounded-[8px] border border-border bg-white px-3 py-2 text-xs" key={check.code}>{check.valid ? <CheckCircle className="size-4 shrink-0 text-[#16834d]" weight="fill" /> : <WarningCircle className="size-4 shrink-0 text-[#c75b12]" weight="fill" />}<span>{check.label}</span></div>)}
          </div>
          <button className="h-10 rounded-[8px] border border-primary px-4 text-sm font-semibold text-primary" onClick={() => test("fallback")} type="button">Проверить fallback</button>
        </div>
        {validation.errors.length > 0 && <ul className="mt-4 list-disc space-y-1 pl-5 text-xs text-[#a04412]">{validation.errors.slice(0, 6).map((error) => <li key={error}>{error}</li>)}</ul>}
        {testResult && <div className="mt-4 rounded-[10px] border border-border bg-white p-4"><p className="text-sm font-semibold">Симуляция: {testResult.status}</p><p className="mt-2 text-xs leading-5 text-muted-foreground">{testResult.visited.map((node) => node.label).join(" → ")}</p></div>}
      </section>

      <section className="border-t border-border bg-white px-5 py-5">
        <details>
          <summary className="cursor-pointer text-sm font-semibold text-primary">История версий ({props.versions.length})</summary>
          <div className="mt-4 overflow-x-auto rounded-[10px] border border-border">
            <table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-muted text-xs text-muted-foreground"><tr><th className="px-4 py-3">Версия</th><th className="px-4 py-3">Состояние</th><th className="px-4 py-3">Изменение</th><th className="px-4 py-3">Автор</th><th className="px-4 py-3">Создана</th><th className="px-4 py-3" /></tr></thead><tbody>{props.versions.map((item) => <tr className="border-t border-border" key={item.version}><td className="px-4 py-3 font-semibold">v{item.version}{item.version === props.activeVersion ? " · активна" : ""}</td><td className="px-4 py-3">{item.publishedAt ? "Опубликована" : item.validationStatus === "valid" ? "Готова" : "Нужна проверка"}</td><td className="px-4 py-3 text-muted-foreground">{item.changeSummary || "Первичная версия"}</td><td className="px-4 py-3 text-muted-foreground">{item.createdBy || "Система"}</td><td className="px-4 py-3 text-muted-foreground">{new Intl.DateTimeFormat("ru-KZ", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt))}</td><td className="px-4 py-3 text-right"><button className="inline-flex items-center gap-1 text-xs font-semibold text-primary disabled:opacity-40" disabled={busy === "rollback" || item.version === props.activeVersion} onClick={() => rollback(item.version)} type="button"><ArrowCounterClockwise className="size-4" />Rollback</button></td></tr>)}</tbody></table>
          </div>
        </details>
      </section>
    </div>
  );
}
