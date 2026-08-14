const defaults = { apiBase: "https://ai-dos-sage.vercel.app", workerSecret: "", tenantId: "", enabled: false, dryRun: true };
const ids = Object.keys(defaults);
const status = document.getElementById("status");
async function load() {
  const values = { ...defaults, ...(await chrome.storage.local.get([...ids, "lastStatus", "lastRunAt"])) };
  for (const id of ids) { const input = document.getElementById(id); if (input.type === "checkbox") input.checked = Boolean(values[id]); else input.value = values[id] || ""; }
  if (values.lastStatus?.message) status.textContent = `${values.lastStatus.message}${values.lastRunAt ? ` · ${new Date(values.lastRunAt).toLocaleTimeString("ru-KZ")}` : ""}`;
}
async function save() {
  const values = Object.fromEntries(ids.map((id) => { const input = document.getElementById(id); return [id, input.type === "checkbox" ? input.checked : input.value.trim()]; }));
  await chrome.storage.local.set(values);
}
if (globalThis.chrome?.storage?.local) {
  for (const id of ids) document.getElementById(id).addEventListener("change", save);
  document.getElementById("inspect").addEventListener("click", async () => { await save(); status.textContent = "Проверяем…"; const value = await chrome.runtime.sendMessage({ type: "ai-dos:inspect" }); status.textContent = value.message || "Проверка завершена."; });
  document.getElementById("scan").addEventListener("click", async () => { await save(); status.textContent = "Читаем графики без данных пациентов…"; const value = await chrome.runtime.sendMessage({ type: "ai-dos:scan" }); status.textContent = value.message || "Синхронизация завершена."; });
  document.getElementById("run").addEventListener("click", async () => { await save(); status.textContent = "Обрабатываем…"; const value = await chrome.runtime.sendMessage({ type: "ai-dos:run" }); status.textContent = value.message || "Готово."; });
  void load();
} else {
  status.textContent = "Предпросмотр интерфейса. Для работы загрузите папку как расширение Chrome.";
}
