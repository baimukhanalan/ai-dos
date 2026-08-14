const URGENT_PATTERNS = [
  /не\s*дыш/i,
  /затруднен[^\s]*\s+дыхан/i,
  /сильн[^\s]*\s+боль/i,
  /потер[^\s]*\s+созн/i,
  /обильн[^\s]*\s+кров/i,
  /задых/i,
  /удуш/i,
  /дем\s*ал[^\s]*\s+қиын/i,
  /дем\s+ала\s+алмай/i,
  /тыныс[^\s]*\s+қиын/i,
  /есінен\s+тан/i,
  /қатты\s+ауыр/i,
  /can't\s+breathe/i,
  /cannot\s+breathe/i,
  /difficulty\s+breathing/i,
  /chest\s+pain/i,
  /unconscious/i,
  /heavy\s+bleeding/i,
];

import { detectIntent } from "@/lib/ai/escalation";
import { detectLanguage } from "@/lib/ai/language";
import { matchKnowledgeRule, type KnowledgeRule } from "@/lib/ai/knowledge-rules";

export type ClinicGroundingContext = {
  knowledge: Array<{
    id: string;
    title: string;
    locale: string;
    content: string;
  }>;
  /** Структурированные правила клиники для адресного ответа. */
  rules?: KnowledgeRule[];
  services: Array<{
    id: string;
    name: string;
    description: string | null;
    durationMinutes: number;
    priceKzt: number | null;
  }>;
  doctors: Array<{
    id: string;
    name: string;
    specialty: string | null;
    branch: string | null;
    languages: string[];
    weeklySchedule?: Array<{
      weekday: number;
      startsAt: string;
      endsAt: string;
      slotMinutes: number;
    }>;
  }>;
  branches: Array<{
    id: string;
    name: string;
    address: string | null;
    phone: string | null;
  }>;
};

const STOP_WORDS = new Set([
  "как",
  "где",
  "что",
  "это",
  "для",
  "или",
  "когда",
  "клиника",
  "клиники",
  "можно",
  "нужно",
  "есть",
  "the",
  "and",
  "for",
  "with",
  "қайда",
  "қалай",
  "және",
]);

function normalizedTokens(value: string) {
  return value
    .toLocaleLowerCase("ru-KZ")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

function bestKnowledgeMatch(message: string, context: ClinicGroundingContext) {
  const lowered = message.toLocaleLowerCase("ru-KZ");
  const intentPattern =
    /адрес|наход|проезд|график|расписан|режим|врач|доктор|специал|подготов|документ|анализ|правил|address|location|hours|doctor|specialist|schedule|prepare|мекенжай|жұмыс|дәрігер|маман|дайын/i;
  const tokens = normalizedTokens(message);
  let best:
    | { entry: ClinicGroundingContext["knowledge"][number]; score: number }
    | undefined;

  for (const entry of context.knowledge) {
    const title = entry.title.toLocaleLowerCase("ru-KZ");
    const content = entry.content.toLocaleLowerCase("ru-KZ");
    let score = 0;
    for (const token of tokens) {
      if (title.includes(token)) score += 3;
      else if (content.includes(token)) score += 1;
    }
    if (
      intentPattern.test(lowered) &&
      ((/адрес|наход|проезд|address|location|мекенжай/i.test(lowered) &&
        /адрес|наход|address|мекенжай/i.test(`${title} ${content}`)) ||
        (/график|режим|hours|жұмыс/i.test(lowered) &&
          /график|режим|hours|жұмыс/i.test(`${title} ${content}`)) ||
        (/врач|доктор|специал|doctor|specialist|дәрігер|маман/i.test(lowered) &&
          /врач|доктор|специал|график|расписан|doctor|specialist|schedule|дәрігер|маман/i.test(
            `${title} ${content}`,
          )) ||
        (/подготов|документ|анализ|prepare|дайын/i.test(lowered) &&
          /подготов|документ|анализ|prepare|дайын/i.test(`${title} ${content}`)))
    ) {
      score += 4;
    }
    if (!best || score > best.score) best = { entry, score };
  }

  return best && best.score >= 2 ? best.entry : undefined;
}

function groundedReply(
  message: string,
  language: "ru" | "kk" | "en",
  context?: ClinicGroundingContext,
) {
  if (!context) return undefined;
  const knowledge = bestKnowledgeMatch(message, context);
  if (knowledge) {
    const content = knowledge.content.trim().slice(0, 1200);
    if (language === "kk") {
      return `Клиниканың расталған білім базасындағы «${knowledge.title}» материалы бойынша: ${content}`;
    }
    if (language === "en") {
      return `According to the clinic’s approved knowledge base (“${knowledge.title}”): ${content}`;
    }
    return `По утверждённой базе знаний клиники («${knowledge.title}»): ${content}`;
  }

  const tokens = normalizedTokens(message);
  const asksPrice = /цен|стоим|price|баға/i.test(message);
  const asksService = /услуг|при[её]м|консультац|service|appointment|қызмет|қабылдау/i.test(
    message,
  );
  if (asksPrice || asksService) {
    const matched = context.services
      .filter((service) => {
        const haystack = `${service.name} ${service.description || ""}`.toLocaleLowerCase("ru-KZ");
        return tokens.length === 0 || tokens.some((token) => haystack.includes(token));
      })
      .slice(0, 5);
    const services = matched.length ? matched : context.services.slice(0, 5);
    if (services.length) {
      const details = services
        .map(
          (service) =>
            `${service.name} — ${service.priceKzt === null ? "цена не опубликована" : `${service.priceKzt.toLocaleString("ru-KZ")} ₸`}, ${service.durationMinutes} мин`,
        )
        .join("; ");
      return language === "kk"
        ? `Клиника жүйесіндегі белсенді қызметтер: ${details}`
        : language === "en"
          ? `Active services in the clinic system: ${details}`
          : `Активные услуги из системы клиники: ${details}`;
    }
  }

  if (/врач|доктор|специалист|doctor|specialist|дәрігер|маман/i.test(message)) {
    const matched = context.doctors
      .filter((doctor) => {
        const haystack = `${doctor.name} ${doctor.specialty || ""}`.toLocaleLowerCase("ru-KZ");
        return tokens.length === 0 || tokens.some((token) => haystack.includes(token));
      })
      .slice(0, 6);
    const doctors = matched.length ? matched : context.doctors.slice(0, 6);
    if (doctors.length) {
      const details = doctors
        .map((doctor) => `${doctor.name} — ${doctor.specialty || "специальность не указана"}`)
        .join("; ");
      return language === "kk"
        ? `Клиника жүйесіндегі белсенді дәрігерлер: ${details}`
        : language === "en"
          ? `Active doctors in the clinic system: ${details}`
          : `Активные врачи из системы клиники: ${details}`;
    }
  }

  if (/адрес|наход|address|location|мекенжай/i.test(message)) {
    const branches = context.branches
      .filter((branch) => branch.address || branch.phone)
      .slice(0, 5);
    if (branches.length) {
      const details = branches
        .map(
          (branch) =>
            `${branch.name}: ${branch.address || "адрес не указан"}${branch.phone ? `, ${branch.phone}` : ""}`,
        )
        .join("; ");
      return language === "kk"
        ? `Клиника филиалдары: ${details}`
        : language === "en"
          ? `Clinic branches: ${details}`
          : `Филиалы клиники: ${details}`;
    }
  }

  return undefined;
}

export function safeAssistantReply(
  message: string,
  context?: ClinicGroundingContext,
) {
  const text = message.trim();
  const language = detectLanguage(text);

  if (URGENT_PATTERNS.some((pattern) => pattern.test(text))) {
    if (language === "kk") {
      return "Бұл шұғыл жағдай болуы мүмкін. Қазір 112 немесе 103 нөміріне қоңырау шалыңыз. Өмірге қауіп төндіретін белгілер бойынша онлайн жауапты күтпеңіз; диалогты клиника қызметкеріне дереу беріңіз.";
    }
    if (language === "en") {
      return "This may be an emergency. Call 112 or 103 now and do not wait for an online reply. Hand the conversation to a clinic staff member immediately.";
    }
    return "Это может быть экстренная ситуация. Позвоните 112 или 103 прямо сейчас и не ждите ответа онлайн. Немедленно передайте диалог сотруднику клиники.";
  }

  if (/damumed|даму.*мед/i.test(text)) {
    if (language === "kk") {
      return "DAMUMED-пен ресми интеграция клиника API бергеннен кейін қосылады. Қазір өтінішті AI Dos ішінде тіркеп, жазбаны регистратура қызметкері арқылы растауға болады.";
    }
    if (language === "en") {
      return "The DAMUMED integration will be enabled only after the clinic provides its official API. For now, record the request in AI Dos and have reception confirm the appointment.";
    }
    return "Интеграция с DAMUMED будет включена только после получения официального API клиники. Пока зафиксируйте запрос в AI Dos и подтвердите запись через сотрудника регистратуры.";
  }

  // Структурированное правило клиники — самый адресный ответ.
  if (context?.rules?.length) {
    const rule = matchKnowledgeRule(context.rules, text, detectIntent(text), language);
    if (rule) {
      const body = rule.body.trim().slice(0, 1200);
      if (language === "kk") return `Клиника ережесі «${rule.title}»: ${body}`;
      if (language === "en") return `Clinic rule “${rule.title}”: ${body}`;
      return `Правило клиники «${rule.title}»: ${body}`;
    }
  }

  const grounded = groundedReply(text, language, context);
  if (grounded) return grounded;

  if (
    /запис|при[её]м|врач|доктор|слот|свободн[^\s]*\s+врем|ближайш[^\s]*\s+врем|appointment|book|doctor|slot|жазыл|дәрігер/i.test(
      text,
    )
  ) {
    if (language === "kk") {
      return "Сәлеметсіз бе! Жазылуға көмектесемін. Қай дәрігер немесе мамандық қажет екенін және ыңғайлы күн мен уақытты нақтылап жіберіңіз. Жазба жүйеде расталғаннан кейін ғана оны дайын деп хабарлаймын.";
    }
    if (language === "en") {
      return "Hello! I can help with the appointment. Please confirm the doctor or specialty and a convenient day and time. I will only describe the booking as confirmed after the system returns confirmation.";
    }
    return "Здравствуйте! Помогу с записью. Уточните врача или специальность, а также удобные день и время. Сообщу, что запись подтверждена, только после подтверждения системы.";
  }

  if (
    /адрес|график|время работы|стоим|цена|address|hours|price|мекенжай|жұмыс уақыты|баға/i.test(
      text,
    )
  ) {
    if (language === "kk") {
      return "Клиника туралы нақты ақпаратты база білімінен тексеремін. Қай филиал, қызмет немесе дәрігер қызықтыратынын жазыңыз — регистратура үшін қысқа жауап дайындаймын.";
    }
    if (language === "en") {
      return "I’ll check the clinic’s approved knowledge base. Tell me which branch, service, or doctor you mean, and I’ll prepare a concise reception reply.";
    }
    return "Проверю точную информацию в утверждённой базе знаний клиники. Уточните филиал, услугу или врача — подготовлю короткий ответ для пациента.";
  }

  if (language === "kk") {
    return "Өтінішті түсіндім. Диагноз қоймай, регистратураның келесі әрекетін дайындауға көмектесемін. Пациентке не қажет екенін — жазылу, қоңырау немесе клиника туралы ақпарат — нақтылап жіберіңіз.";
  }
  if (language === "en") {
    return "I understand the request. I can help prepare the next reception action without diagnosing. Please clarify whether the patient needs an appointment, a callback, or clinic information.";
  }
  return "Понял запрос. Помогу подготовить следующий шаг регистратуры без постановки диагноза. Уточните, пациенту нужна запись, обратный звонок или информация о клинике.";
}
