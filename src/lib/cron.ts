import "server-only";

/**
 * Машинные эндпоинты открываются только по секрету. Если секрет не задан,
 * маршрут закрыт полностью — «пустой секрет» никогда не считается совпавшим.
 */
export function authorizeSecret(request: Request, expected: string | undefined) {
  if (!expected) return false;
  return request.headers.get("authorization") === `Bearer ${expected}`;
}

/**
 * Cron-эндпоинты доступны только планировщику Vercel или внешнему шедулеру
 * клиники: без секрета маршрут не выполняет никакой работы.
 */
export function authorizeCron(request: Request) {
  return authorizeSecret(request, process.env.CRON_SECRET);
}

/** Отдельный секрет у внешнего воркера МИС: он живёт на чужом хосте. */
export function authorizeMisWorker(request: Request) {
  return authorizeSecret(request, process.env.MIS_WORKER_SECRET);
}

export function cronUnauthorized() {
  return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
}
