import { z } from "zod";

export const scenarioNodeTypes = [
  "trigger",
  "intent",
  "condition",
  "question",
  "confirmation",
  "action",
  "api_call",
  "branch",
  "wait",
  "transfer",
  "notification",
  "webhook",
  "error_handler",
  "fallback",
  "end",
] as const;

export const scenarioToolNames = [
  "identifyPatient",
  "verifyIIN",
  "searchPatient",
  "searchDoctor",
  "searchService",
  "getAvailableSlots",
  "createAppointment",
  "rescheduleAppointment",
  "cancelAppointment",
  "addToWaitlist",
  "createUrgentRequest",
  "createCallback",
  "sendConfirmation",
  "transferToHuman",
  "queryKnowledgeBase",
] as const;

const nodeId = z.string().trim().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/);

export const scenarioNodeSchema = z.object({
  id: nodeId,
  type: z.enum(scenarioNodeTypes),
  label: z.string().trim().min(2).max(120),
  config: z
    .object({
      text: z.string().trim().max(1200).optional(),
      locale: z.enum(["auto", "ru", "kk", "en"]).optional(),
      tool: z.enum(scenarioToolNames).optional(),
      onLowConfidence: z.enum(["clarify", "transfer"]).optional(),
      waitSeconds: z.number().int().min(1).max(3600).optional(),
    })
    .strict()
    .default({}),
});

export const scenarioEdgeSchema = z.object({
  id: nodeId,
  from: nodeId,
  to: nodeId,
  label: z.string().trim().max(80).optional(),
});

export const scenarioGraphSchema = z.object({
  nodes: z.array(scenarioNodeSchema).min(2).max(60),
  edges: z.array(scenarioEdgeSchema).min(1).max(120),
});

export type ScenarioGraph = z.infer<typeof scenarioGraphSchema>;
export type ScenarioNode = z.infer<typeof scenarioNodeSchema>;

export type ScenarioValidationCheck = {
  code: string;
  label: string;
  valid: boolean;
  detail?: string;
};

export type ScenarioValidationResult = {
  valid: boolean;
  checks: ScenarioValidationCheck[];
  errors: string[];
};

export function normalizeScenarioGraph(input: unknown): ScenarioGraph {
  const parsed = scenarioGraphSchema.safeParse(input);
  if (parsed.success) return parsed.data;
  const legacy = input as {
    nodes?: Array<{ id?: unknown; type?: unknown; label?: unknown; config?: unknown }>;
    edges?: Array<{ id?: unknown; from?: unknown; to?: unknown; label?: unknown; condition?: unknown }>;
  };
  const nodes = Array.isArray(legacy?.nodes)
    ? legacy.nodes.map((node, index) => ({
        id: typeof node.id === "string" ? node.id : `legacy-node-${index + 1}`,
        type: scenarioNodeTypes.includes(node.type as (typeof scenarioNodeTypes)[number])
          ? node.type as (typeof scenarioNodeTypes)[number]
          : "fallback" as const,
        label: typeof node.label === "string" && node.label.trim() ? node.label : `Блок ${index + 1}`,
        config: typeof node.config === "object" && node.config !== null ? node.config : {},
      }))
    : [];
  const edges = Array.isArray(legacy?.edges)
    ? legacy.edges.map((edge, index) => ({
        id: typeof edge.id === "string" ? edge.id : `legacy-edge-${index + 1}`,
        from: String(edge.from || ""),
        to: String(edge.to || ""),
        label:
          typeof edge.label === "string"
            ? edge.label
            : typeof edge.condition === "string"
              ? edge.condition.replaceAll("_", " ")
              : undefined,
      }))
    : [];
  const normalized = scenarioGraphSchema.safeParse({ nodes, edges });
  if (!normalized.success) {
    throw new Error("scenario_graph_unreadable");
  }
  return normalized.data;
}

const toolNodeTypes = new Set([
  "action",
  "api_call",
  "notification",
  "webhook",
  "transfer",
  "fallback",
  "error_handler",
]);
const policyUnsafe = [
  /раскры(ть|вай).*полн(ый|ого).*иин/i,
  /сообщ(ить|ай).*полн(ый|ого).*иин/i,
  /постав(ить|ь).*диагноз/i,
  /назнач(ить|ь).*дозиров/i,
  /full[_ -]?iin/i,
  /bypass[_ -]?identity/i,
];

export function validateScenarioGraph(input: unknown): ScenarioValidationResult {
  const parsed = scenarioGraphSchema.safeParse(input);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((issue) => `${issue.path.join(".") || "graph"}: ${issue.message}`);
    return {
      valid: false,
      errors,
      checks: [{ code: "schema", label: "Структура графа корректна", valid: false, detail: errors[0] }],
    };
  }

  const graph = parsed.data;
  const errors: string[] = [];
  const ids = new Set<string>();
  const duplicateIds = new Set<string>();
  for (const node of graph.nodes) {
    if (ids.has(node.id)) duplicateIds.add(node.id);
    ids.add(node.id);
  }
  if (duplicateIds.size) errors.push(`Повторяются ID блоков: ${[...duplicateIds].join(", ")}.`);

  const triggers = graph.nodes.filter((node) => node.type === "trigger");
  const ends = graph.nodes.filter((node) => node.type === "end");
  if (triggers.length !== 1) errors.push("Сценарий должен содержать ровно один стартовый trigger-блок.");
  if (!ends.length) errors.push("Сценарий должен содержать хотя бы один end-блок.");

  const edgeKeys = new Set<string>();
  for (const edge of graph.edges) {
    if (!ids.has(edge.from) || !ids.has(edge.to)) errors.push(`Связь ${edge.id} ссылается на отсутствующий блок.`);
    if (edge.from === edge.to) errors.push(`Блок ${edge.from} не может ссылаться сам на себя.`);
    const key = `${edge.from}:${edge.to}:${edge.label || ""}`;
    if (edgeKeys.has(key)) errors.push(`Связь ${edge.from} → ${edge.to} повторяется.`);
    edgeKeys.add(key);
  }

  const outgoing = new Map<string, string[]>();
  for (const edge of graph.edges) outgoing.set(edge.from, [...(outgoing.get(edge.from) || []), edge.to]);
  for (const node of graph.nodes) {
    if (node.type !== "end" && !(outgoing.get(node.id)?.length)) errors.push(`Блок «${node.label}» не имеет выхода.`);
    if (toolNodeTypes.has(node.type) && !node.config.tool) errors.push(`Для блока «${node.label}» нужно выбрать разрешённый tool.`);
    if (["transfer", "fallback", "error_handler"].includes(node.type) && node.config.tool !== "transferToHuman") {
      errors.push(`Блок «${node.label}» должен использовать tool transferToHuman.`);
    }
    if (["question", "confirmation"].includes(node.type) && !node.config.text) errors.push(`Для блока «${node.label}» нужен текст реплики.`);
    if (node.type === "wait" && !node.config.waitSeconds) errors.push(`Для блока «${node.label}» укажите ограниченное время ожидания.`);
    const policyText = `${node.label}\n${node.config.text || ""}`;
    if (policyUnsafe.some((pattern) => pattern.test(policyText))) errors.push(`Блок «${node.label}» нарушает медицинскую или privacy-политику.`);
  }

  const reachable = new Set<string>();
  if (triggers[0]) {
    const queue = [triggers[0].id];
    while (queue.length) {
      const current = queue.shift()!;
      if (reachable.has(current)) continue;
      reachable.add(current);
      queue.push(...(outgoing.get(current) || []));
    }
  }
  const unreachable = graph.nodes.filter((node) => !reachable.has(node.id));
  if (unreachable.length) errors.push(`Недостижимые блоки: ${unreachable.map((node) => node.label).join(", ")}.`);

  const visiting = new Set<string>();
  const visited = new Set<string>();
  let hasCycle = false;
  function visit(nodeId: string) {
    if (visiting.has(nodeId)) {
      hasCycle = true;
      return;
    }
    if (visited.has(nodeId)) return;
    visiting.add(nodeId);
    for (const next of outgoing.get(nodeId) || []) visit(next);
    visiting.delete(nodeId);
    visited.add(nodeId);
  }
  if (triggers[0]) visit(triggers[0].id);
  if (hasCycle) errors.push("Циклы запрещены без отдельной ограниченной retry-политики.");

  const hasSafeHandoff = graph.nodes.some((node) =>
    ["transfer", "fallback", "error_handler"].includes(node.type),
  );
  if (!hasSafeHandoff) errors.push("Добавьте безопасную передачу сотруднику или обработчик ошибки.");

  const policySafe = !graph.nodes.some((node) =>
    policyUnsafe.some((pattern) => pattern.test(`${node.label}\n${node.config.text || ""}`)),
  );
  const checks: ScenarioValidationCheck[] = [
    { code: "start", label: "Блок старта присутствует", valid: triggers.length === 1 },
    { code: "end", label: "Конец сценария достижим", valid: ends.length > 0 && ends.every((node) => reachable.has(node.id)) },
    { code: "handoff", label: "Безопасная передача предусмотрена", valid: hasSafeHandoff },
    { code: "privacy", label: "Нет раскрытия данных пациента", valid: policySafe },
    { code: "tools", label: "Действия используют разрешённые tools", valid: !graph.nodes.some((node) => toolNodeTypes.has(node.type) && !node.config.tool) },
  ];
  return { valid: errors.length === 0 && checks.every((check) => check.valid), checks, errors };
}

export function defaultScenarioGraph(triggerKind: string): ScenarioGraph {
  return {
    nodes: [
      { id: "trigger", type: "trigger", label: "Входящий запрос", config: { text: triggerKind, locale: "auto" } },
      { id: "intent", type: "intent", label: "Определить намерение", config: { locale: "auto", onLowConfidence: "transfer" } },
      { id: "question", type: "question", label: "Какого врача вы ищете?", config: { text: "Какого врача вы ищете?", locale: "auto", onLowConfidence: "clarify" } },
      { id: "slots", type: "action", label: "Получить свободные окна", config: { tool: "getAvailableSlots", locale: "auto" } },
      { id: "confirm", type: "confirmation", label: "Подтвердить дату и время", config: { text: "Подтвердите выбранные дату и время.", locale: "auto", onLowConfidence: "clarify" } },
      { id: "notify", type: "notification", label: "Отправить подтверждение", config: { tool: "sendConfirmation", locale: "auto" } },
      { id: "transfer", type: "transfer", label: "Передать регистратору", config: { tool: "transferToHuman", locale: "auto" } },
      { id: "success-end", type: "end", label: "Завершить разговор", config: {} },
      { id: "handoff-end", type: "end", label: "Завершить после передачи", config: {} },
    ],
    edges: [
      { id: "e1", from: "trigger", to: "intent" },
      { id: "e2", from: "intent", to: "question", label: "Распознано" },
      { id: "e3", from: "intent", to: "transfer", label: "Низкая уверенность" },
      { id: "e4", from: "question", to: "slots" },
      { id: "e5", from: "slots", to: "confirm" },
      { id: "e6", from: "confirm", to: "notify", label: "Успех" },
      { id: "e7", from: "confirm", to: "transfer", label: "Ошибка / нет ответа" },
      { id: "e8", from: "notify", to: "success-end" },
      { id: "e9", from: "transfer", to: "handoff-end" },
    ],
  };
}

export function simulateScenario(graphInput: unknown, outcome: "success" | "fallback") {
  const validation = validateScenarioGraph(graphInput);
  if (!validation.valid) return { status: "failed" as const, visited: [], validation };
  const graph = scenarioGraphSchema.parse(graphInput);
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const trigger = graph.nodes.find((node) => node.type === "trigger")!;
  const visited: ScenarioNode[] = [];
  const seen = new Set<string>();
  let current: ScenarioNode | undefined = trigger;
  while (current && !seen.has(current.id) && visited.length <= graph.nodes.length) {
    visited.push(current);
    seen.add(current.id);
    if (current.type === "end") break;
    const edges = graph.edges.filter((edge) => edge.from === current!.id);
    const preferred = outcome === "fallback"
      ? edges.find((edge) => /ошиб|низк|fallback|нет ответа/i.test(edge.label || ""))
      : edges.find((edge) => /успех|распознано|success/i.test(edge.label || ""));
    current = byId.get((preferred || edges[0])?.to || "");
  }
  const handedOff = visited.some((node) => node.type === "transfer");
  const completed = visited.at(-1)?.type === "end";
  return {
    status: completed ? (handedOff ? "handed_off" as const : "completed" as const) : "failed" as const,
    visited: visited.map((node) => ({ id: node.id, type: node.type, label: node.label })),
    validation,
  };
}
