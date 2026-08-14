import { describe, expect, it } from "vitest";
import {
  defaultScenarioGraph,
  simulateScenario,
  validateScenarioGraph,
} from "@/lib/scenarios/graph";

describe("scenario builder safety", () => {
  it("builds a valid appointment scenario with a safe handoff", () => {
    const result = validateScenarioGraph(defaultScenarioGraph("appointment"));
    expect(result.valid).toBe(true);
    expect(result.checks.every((check) => check.valid)).toBe(true);
  });

  it("rejects a graph without a human fallback", () => {
    const graph = defaultScenarioGraph("appointment");
    graph.nodes = graph.nodes.filter((node) => node.type !== "transfer");
    graph.edges = graph.edges.filter(
      (edge) => edge.from !== "transfer" && edge.to !== "transfer",
    );
    const result = validateScenarioGraph(graph);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      "Добавьте безопасную передачу сотруднику или обработчик ошибки.",
    );
  });

  it("blocks scenario copy that asks to disclose a full IIN", () => {
    const graph = defaultScenarioGraph("appointment");
    graph.nodes = graph.nodes.map((node) =>
      node.id === "question"
        ? { ...node, config: { ...node.config, text: "Сообщить полный ИИН пациенту" } }
        : node,
    );
    const result = validateScenarioGraph(graph);
    expect(result.valid).toBe(false);
    expect(result.checks.find((check) => check.code === "privacy")?.valid).toBe(
      false,
    );
  });

  it("simulates success and fallback as different recorded paths", () => {
    const graph = defaultScenarioGraph("appointment");
    const success = simulateScenario(graph, "success");
    const fallback = simulateScenario(graph, "fallback");
    expect(success.status).toBe("completed");
    expect(success.visited.some((node) => node.id === "notify")).toBe(true);
    expect(fallback.status).toBe("handed_off");
    expect(fallback.visited.some((node) => node.id === "transfer")).toBe(true);
  });

  it("rejects edges that reference missing blocks", () => {
    const graph = defaultScenarioGraph("appointment");
    graph.edges.push({ id: "broken", from: "trigger", to: "missing" });
    const result = validateScenarioGraph(graph);
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes("отсутствующий блок"))).toBe(
      true,
    );
  });
});
