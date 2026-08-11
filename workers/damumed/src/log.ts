type Level = "info" | "warn" | "error";

function emit(level: Level, message: string, data?: Record<string, unknown>) {
  const line = {
    ts: new Date().toISOString(),
    level,
    message,
    ...(data ? { data } : {}),
  };
  const target = level === "error" ? console.error : console.log;
  target(JSON.stringify(line));
}

export const log = {
  info: (message: string, data?: Record<string, unknown>) => emit("info", message, data),
  warn: (message: string, data?: Record<string, unknown>) => emit("warn", message, data),
  error: (message: string, data?: Record<string, unknown>) => emit("error", message, data),
};

/**
 * Персональные данные пациента в журнал не пишем: для разбора инцидента
 * достаточно идентификатора записи и хвоста имени.
 */
export function maskName(fullName: string) {
  const parts = fullName.trim().split(/\s+/);
  if (!parts.length) return "—";
  return `${parts[0]} ${parts.slice(1).map((part) => `${part[0]}.`).join("")}`.trim();
}
