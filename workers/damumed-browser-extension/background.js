const DEFAULTS = {
  apiBase: "https://ai-dos-sage.vercel.app",
  workerSecret: "",
  enabled: false,
  dryRun: true,
  pollMinutes: 1,
  tenantId: "",
};

async function settings() {
  return { ...DEFAULTS, ...(await chrome.storage.local.get(DEFAULTS)) };
}

async function saveStatus(status) {
  await chrome.storage.local.set({ lastStatus: status, lastRunAt: new Date().toISOString() });
}

async function damumedTab() {
  const tabs = await chrome.tabs.query({ url: "https://reg-ala.dmed.kz/*" });
  return tabs.find((tab) => tab.id && tab.status === "complete") || null;
}

async function api(path, options = {}) {
  const config = await settings();
  const response = await fetch(`${config.apiBase.replace(/\/$/, "")}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${config.workerSecret}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message || payload.error || `AI Dos: HTTP ${response.status}`);
  return payload;
}

async function inspect() {
  const tab = await damumedTab();
  if (!tab?.id) return { ok: false, message: "Откройте авторизованную вкладку reg-ala.dmed.kz." };
  return chrome.tabs.sendMessage(tab.id, { type: "ai-dos:inspect" });
}

async function scanAndSync() {
  const config = await settings();
  if (!config.workerSecret) return { ok: false, message: "Не задан секрет внешнего воркера." };
  if (!config.tenantId) return { ok: false, message: "Не задан ID клиники AI Dos." };
  const tab = await damumedTab();
  if (!tab?.id) return { ok: false, message: "Нет открытой авторизованной вкладки DAMUMED." };
  const snapshot = await chrome.tabs.sendMessage(tab.id, { type: "ai-dos:scan", tenantId: config.tenantId });
  if (!snapshot?.doctors?.length) return { ok: false, message: snapshot?.message || "Графики не распознаны." };
  const response = await api("/api/mis/directory-snapshot", { method: "POST", body: JSON.stringify(snapshot) });
  return { ok: true, message: `Синхронизировано врачей: ${response.data.doctors}, свободных слотов: ${response.data.availableSlots}.` };
}

async function runOnce({ manual = false } = {}) {
  const config = await settings();
  if (!manual && !config.enabled) return { ok: false, skipped: true, message: "Автоматический режим выключен." };
  if (!config.workerSecret) return { ok: false, skipped: true, message: "Не задан секрет внешнего воркера." };

  const tab = await damumedTab();
  if (!tab?.id) return { ok: false, skipped: true, message: "Нет открытой авторизованной вкладки DAMUMED." };
  const page = await chrome.tabs.sendMessage(tab.id, { type: "ai-dos:inspect" });
  if (!page?.ready) return { ok: false, skipped: true, message: page?.message || "Страница регистратуры не готова." };
  if (config.dryRun) return { ok: true, dryRun: true, message: "Проверка пройдена. Очередь не запрашивалась и запись не изменялась." };

  const queue = await api("/api/mis/queue?limit=1");
  const item = queue.items?.[0];
  if (!item) return { ok: true, message: "Очередь пуста." };

  const startedAt = Date.now();
  let result;
  try {
    result = await chrome.tabs.sendMessage(tab.id, { type: "ai-dos:book", item });
  } catch (error) {
    result = {
      status: "failed",
      errorCode: "bridge_error",
      message: error instanceof Error ? error.message.slice(0, 280) : "Расширение не получило ответ страницы.",
      retryable: true,
    };
  }

  await api("/api/mis/results", {
    method: "POST",
    body: JSON.stringify({
      results: [{ appointmentId: item.appointmentId, durationMs: Date.now() - startedAt, result }],
    }),
  });
  return { ok: result.status === "synced", message: result.status === "synced" ? "Запись создана и перечитана." : result.message, result };
}

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.local.set({ ...(await settings()) });
  await chrome.alarms.create("ai-dos-damumed-poll", { periodInMinutes: 1 });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "ai-dos-damumed-poll") return;
  try { await saveStatus(await runOnce()); }
  catch (error) { await saveStatus({ ok: false, message: error instanceof Error ? error.message : "Неизвестная ошибка." }); }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "ai-dos:inspect") inspect().then(sendResponse).catch((error) => sendResponse({ ok: false, message: error.message }));
  else if (message?.type === "ai-dos:scan") scanAndSync().then(async (value) => { await saveStatus(value); sendResponse(value); }).catch((error) => sendResponse({ ok: false, message: error.message }));
  else if (message?.type === "ai-dos:run") runOnce({ manual: true }).then(async (value) => { await saveStatus(value); sendResponse(value); }).catch((error) => sendResponse({ ok: false, message: error.message }));
  else return false;
  return true;
});
