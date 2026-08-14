const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim().toLocaleLowerCase("ru-KZ");
const visible = (element) => element instanceof HTMLElement && element.getClientRects().length > 0;

function pageText() { return normalize(document.body?.innerText); }
function elements(selector) { return [...document.querySelectorAll(selector)].filter(visible); }
function exactText(text, root = document) {
  const target = normalize(text);
  return [...root.querySelectorAll("button, a, label, td, div, span, option")]
    .filter(visible)
    .filter((element) => normalize(element.textContent) === target)
    .filter((element) => ![...element.children].some((child) => visible(child) && normalize(child.textContent) === target));
}
function containingText(text, root = document) {
  const target = normalize(text);
  return [...root.querySelectorAll("button, a, label, td, div, span, option")]
    .filter(visible)
    .filter((element) => normalize(element.textContent).includes(target));
}
function setValue(control, value) {
  const prototype = control instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  setter?.call(control, value);
  control.dispatchEvent(new Event("input", { bubbles: true }));
  control.dispatchEvent(new Event("change", { bubbles: true }));
}
function nearbyControl(labelText, selector = "input, select, textarea") {
  const label = containingText(labelText).sort((a, b) => a.textContent.length - b.textContent.length)[0];
  if (!label) return null;
  if (label instanceof HTMLLabelElement && label.htmlFor) return document.getElementById(label.htmlFor);
  return label.closest("tr, div, fieldset, form")?.querySelector(selector) || label.parentElement?.querySelector(selector) || null;
}
function uniqueOrThrow(candidates, code, description) {
  if (candidates.length !== 1) throw Object.assign(new Error(description), { code });
  return candidates[0];
}
async function waitFor(check, message, timeout = 12_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) { const value = check(); if (value) return value; await sleep(250); }
  throw Object.assign(new Error(message), { code: "page_timeout" });
}
async function clickText(text) {
  const actions = exactText(text).map((element) => element.closest("button, a, [role=button], input[type=button], input[type=submit]") || element);
  const element = uniqueOrThrow([...new Set(actions)], "ambiguous_control", `Не найдена единственная кнопка «${text}».`);
  element.click();
  await sleep(450);
}
function chooseSelect(select, wanted) {
  const target = normalize(wanted);
  const options = [...select.options].filter((option) => normalize(option.textContent).includes(target));
  const option = uniqueOrThrow(options, "service_not_unique", `Не найдено единственное значение «${wanted}».`);
  setValue(select, option.value);
}
async function chooseControl(control, wanted) {
  if (control instanceof HTMLSelectElement) return chooseSelect(control, wanted);
  if (!(control instanceof HTMLInputElement)) throw Object.assign(new Error(`Поле «${wanted}» имеет неизвестный тип.`), { code: "control_type_unknown" });
  setValue(control, wanted);
  await sleep(350);
  const option = uniqueOrThrow(exactText(wanted).filter((element) => element !== control), "service_not_unique", `Не найдено единственное значение «${wanted}».`);
  option.click();
}
function localParts(iso, timezone) {
  const date = new Date(iso);
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone || "Asia/Almaty", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

const occupiedSlotMarkers = [
  "контакты",
  "консультация:",
  "талон",
  "отменить",
  "печать договора",
  "не оплачено",
  "не выполнено",
];

function slotLooksAvailable(element) {
  let current = element;
  for (let depth = 0; current && depth < 5; depth += 1, current = current.parentElement) {
    const text = normalize(current.innerText || current.textContent);
    if (occupiedSlotMarkers.some((marker) => text.includes(marker))) return false;
    const timeRanges = text.match(/\b\d{2}:\d{2}\s*[-–]\s*\d{2}:\d{2}\b/g) || [];
    // Once an ancestor contains several cards, it is the schedule container and
    // must not influence the status of this individual slot.
    if (timeRanges.length > 1 || text.length > 700) break;
  }
  return true;
}

function inspectPage() {
  const text = pageText();
  const authenticated = /выход|изменить пароль/.test(text);
  const registry = /запись на прием|запись на приём|электронная регистратура/.test(text);
  return {
    ok: authenticated && registry,
    ready: authenticated && registry,
    authenticated,
    registry,
    url: location.origin + location.pathname,
    message: !authenticated ? "Вкладка DAMUMED не авторизована." : !registry ? "Откройте раздел «Запись на приём»." : "Страница готова к безопасной проверке.",
  };
}

function patientIdentityVisible(item) {
  const text = pageText();
  if (!text.includes(normalize(item.patientFullName))) return false;
  if (!item.patientBirthDate) return true;
  const date = String(item.patientBirthDate).slice(0, 10).split("-").reverse().join(".");
  return text.includes(normalize(date));
}

function scheduleDate() {
  const control = elements('input[type="date"]').find(Boolean) || elements("input").find((input) => /^\d{2}[./]\d{2}[./]\d{4}$/.test(input.value));
  if (!control?.value) throw Object.assign(new Error("Не найдена дата открытого графика."), { code: "schedule_date_missing" });
  if (/^\d{4}-\d{2}-\d{2}$/.test(control.value)) return control.value;
  const [day, month, year] = control.value.split(/[./]/);
  return `${year}-${month}-${day}`;
}

function scheduleLabels() {
  const free = containingText("Свободно:").filter((element) => ![...element.children].some((child) => normalize(child.textContent).includes("свободно:")));
  const labels = free.map((element) => {
    const container = element.closest("tr, li") || element.parentElement?.parentElement || element.parentElement;
    const lines = String(container?.innerText || "").split("\n").map((line) => line.trim()).filter(Boolean);
    return lines.find((line) => !/свободно:|^\d{2}:\d{2}/i.test(line)) || null;
  }).filter(Boolean);
  return [...new Set(labels)];
}

function fullDoctorName(label, date) {
  const dateDisplay = date.split("-").reverse().join(".");
  const labelName = label.split(/кабинет/i)[0].trim();
  const candidates = [...document.querySelectorAll("body *")]
    .filter(visible)
    .map((element) => String(element.textContent || "").replace(/\s+/g, " ").trim())
    .filter((text) => text.includes(dateDisplay) && normalize(text).includes(normalize(labelName)));
  const shortest = candidates.sort((a, b) => a.length - b.length)[0] || "";
  const parts = shortest.split(",").map((part) => part.trim()).filter(Boolean);
  return parts.find((part) => part.length >= 5 && !/все|кабинет|\d{2}[.]\d{2}[.]\d{4}/i.test(part)) || labelName;
}

function freeSlots(date) {
  const timePattern = /^(\d{2}:\d{2})\s*[-–]\s*(\d{2}:\d{2})$/;
  const seen = new Set();
  const slots = [];
  for (const element of [...document.querySelectorAll("div, td")].filter(visible)) {
    const ownLines = String(element.innerText || "").split("\n").map((line) => line.trim()).filter(Boolean);
    if (ownLines.length !== 1) continue;
    const match = ownLines[0].match(timePattern);
    if (!match || seen.has(match[1]) || !slotLooksAvailable(element)) continue;
    seen.add(match[1]);
    slots.push({ startsAt: `${date}T${match[1]}:00+05:00`, endsAt: `${date}T${match[2]}:00+05:00`, status: "available" });
  }
  return slots;
}

async function scanSchedules(tenantId) {
  const page = inspectPage();
  if (!page.ready) throw new Error(page.message);
  const back = exactText("Вернуться к графикам");
  if (back.length === 1) { back[0].click(); await sleep(450); }
  const date = scheduleDate();
  const labels = scheduleLabels();
  if (!labels.length) throw new Error("На странице не найдены строки со счётчиком «Свободно». Откройте список графиков на нужную дату.");
  const doctors = [];
  for (const label of labels.slice(0, 100)) {
    const matches = exactText(label).length ? exactText(label) : containingText(label);
    const row = uniqueOrThrow(matches, "schedule_not_unique", `График «${label}» найден неоднозначно.`);
    row.click();
    await waitFor(() => exactText("Вернуться к графикам").length === 1, `График «${label}» не открылся.`);
    const roomMatch = label.match(/кабинет\s+(.+)$/i);
    doctors.push({
      externalId: `schedule:${normalize(label).replace(/[^a-zа-яёәіңғүұқөһ0-9]+/gi, "-").slice(0, 170)}`,
      name: fullDoctorName(label, date),
      specialty: roomMatch ? roomMatch[1].replace(/^врача\s+/i, "").trim() : null,
      room: roomMatch ? `Кабинет ${roomMatch[1]}` : null,
      slots: freeSlots(date),
    });
    await clickText("Вернуться к графикам");
    await waitFor(() => scheduleLabels().length > 0, "Список графиков не восстановился.");
  }
  return { tenantId, scheduleDate: date, observedAt: new Date().toISOString(), sourceUrl: location.origin + location.pathname, doctors };
}

async function book(item) {
  try {
    const page = inspectPage();
    if (!page.ready) throw Object.assign(new Error(page.message), { code: "page_not_ready" });
    if (!item.patientFullName || !item.doctorName || !item.startsAt) throw Object.assign(new Error("AI Dos передал неполную запись."), { code: "invalid_payload" });

    // 1. Patient must already be selected or found by an exact query. The bridge
    // never creates a new patient and never guesses between similar names.
    if (!patientIdentityVisible(item)) {
      const search = nearbyControl("Поиск пациента", "input") || elements("input").find((input) => /пациент|фио|иин/.test(normalize(input.placeholder)));
      if (!search) throw Object.assign(new Error("Не найден поиск пациента."), { code: "patient_search_missing" });
      setValue(search, item.patientFullName);
      const searchButtons = containingText("поиск").filter((element) => ["BUTTON", "A"].includes(element.tagName));
      if (searchButtons.length === 1) searchButtons[0].click();
      await waitFor(() => pageText().includes(normalize(item.patientFullName)), "Пациент не найден по точному ФИО.");
      const patientChoice = exactText(item.patientFullName);
      if (patientChoice.length === 1) patientChoice[0].click();
      await waitFor(() => patientIdentityVisible(item), "Не удалось подтвердить ФИО и дату рождения выбранного пациента.");
    }

    // 2. Open appointment schedule and choose the exact doctor row.
    if (!/наименование графика|режимы/.test(pageText())) await clickText("ЗАПИСЬ НА ПРИЕМ");
    const slot = localParts(item.startsAt, item.timezone);
    const back = exactText("Вернуться к графикам");
    if (back.length === 1) { back[0].click(); await sleep(450); }
    const dateControl = elements('input[type="date"]').find(Boolean) || elements("input").find((input) => /^\d{2}[./]\d{2}[./]\d{4}$/.test(input.value));
    if (!dateControl) throw Object.assign(new Error("Не найден выбор даты графика."), { code: "schedule_date_missing" });
    const displayDate = slot.date.split("-").reverse().join(".");
    setValue(dateControl, dateControl.type === "date" ? slot.date : displayDate);
    dateControl.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await sleep(650);
    const doctorCandidates = exactText(item.doctorName).length ? exactText(item.doctorName) : containingText(item.doctorName);
    const doctor = uniqueOrThrow(doctorCandidates, "doctor_not_unique", `Врач «${item.doctorName}» отсутствует или найден несколько раз.`);
    doctor.click();
    await sleep(650);

    // 3. Choose the exact free slot. A colored/occupied card with the same time
    // is rejected; only a visibly empty slot is allowed.
    const slotCandidates = containingText(slot.time).filter((element) => {
      const ownLines = String(element.innerText || element.textContent || "").split("\n").map((line) => line.trim()).filter(Boolean);
      return ownLines.length === 1
        && ownLines[0].startsWith(slot.time)
        && slotLooksAvailable(element);
    });
    uniqueOrThrow(slotCandidates, "slot_not_unique", `Свободный слот ${slot.time} не найден однозначно.`).click();
    await waitFor(() => /тип оплаты/.test(pageText()), "Окно записи не открылось.");

    // 4. Reproduce the operator flow shown in the supplied evidence.
    const reasonRadio = elements('input[type="radio"]').find((input) => /по поводу/.test(normalize(input.parentElement?.textContent)));
    reasonRadio?.click();
    const payment = nearbyControl("Тип оплаты", "select");
    if (!(payment instanceof HTMLSelectElement)) throw Object.assign(new Error("Не найдено поле «Тип оплаты»."), { code: "payment_missing" });
    chooseSelect(payment, "Государственные");
    const place = nearbyControl("Место оказания", "select");
    if (place instanceof HTMLSelectElement) chooseSelect(place, "В поликлинике");
    const service = nearbyControl("Услуга", "select, input");
    if (!(service instanceof HTMLSelectElement || service instanceof HTMLInputElement)) throw Object.assign(new Error("Не найдено поле «Услуга»."), { code: "service_missing" });
    await chooseControl(service, item.serviceName || item.doctorName);

    await clickText("Сохранить");
    await sleep(400);
    const confirmation = [...containingText("вы уверены"), ...containingText("действительно")].find(visible);
    if (confirmation) {
      const dialog = confirmation.closest('[role="dialog"], .ui-dialog, .modal') || confirmation.parentElement;
      const yes = dialog ? containingText("да", dialog).filter((element) => ["BUTTON", "A", "INPUT"].includes(element.tagName)) : [];
      uniqueOrThrow(yes, "confirmation_ambiguous", "Диалог подтверждения не содержит единственную кнопку «Да».").click();
    }

    // 5. A submit is not success. Re-read the schedule card and require exact
    // patient + start time before reporting synced to AI Dos.
    const verifiedCard = await waitFor(() => containingText(item.patientFullName).find((element) => normalize(element.closest("div, td")?.textContent).includes(normalize(slot.time))), "После сохранения пациент не появился в выбранном слоте.", 15_000);
    return { status: "synced", externalId: `damumed:${item.appointmentId}:${slot.date}:${slot.time}`, verified: Boolean(verifiedCard) };
  } catch (error) {
    return {
      status: "failed",
      errorCode: error?.code || "dom_contract_changed",
      message: String(error?.message || "Не удалось выполнить запись.").slice(0, 300),
      retryable: ["page_timeout", "page_not_ready"].includes(error?.code),
    };
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "ai-dos:inspect") sendResponse(inspectPage());
  else if (message?.type === "ai-dos:scan") scanSchedules(message.tenantId).then(sendResponse).catch((error) => sendResponse({ message: error.message, doctors: [] }));
  else if (message?.type === "ai-dos:book") book(message.item).then(sendResponse);
  else return false;
  return true;
});
