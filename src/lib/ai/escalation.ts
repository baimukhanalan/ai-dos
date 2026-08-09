export const escalationReasons = [
  "emergency",
  "complaint",
  "human_request",
  "sensitive_data",
  "no_slot",
  "out_of_scope",
  "identity_unverified",
  "other",
] as const;
export type EscalationReason = (typeof escalationReasons)[number];

export const patientIntents = [
  "book",
  "reschedule",
  "cancel",
  "schedule_info",
  "price",
  "address",
  "preparation",
  "find_doctor",
  "appointment_info",
  "urgent",
  "results",
  "complaint",
  "human",
  "other",
] as const;
export type PatientIntent = (typeof patientIntents)[number];

export type EscalationPriority = "low" | "normal" | "high" | "urgent";

export type EscalationDecision = {
  shouldEscalate: boolean;
  reason: EscalationReason;
  priority: EscalationPriority;
  intent: PatientIntent;
};

/** Признаки угрозы жизни — самый высокий приоритет, минуют любую запись. */
const emergencyPatterns = [
  /не\s*дыш/i,
  /не\s+мог[а-яё]*\s+дыш/i,
  /тяжело\s+дыш/i,
  /затруднен[^\s]*\s+дыхан/i,
  /сильн[^\s]*\s+боль/i,
  /боль\s+в\s+груд/i,
  /потер[^\s]*\s+созн/i,
  /обильн[^\s]*\s+кров/i,
  /задых/i,
  /удуш/i,
  /дем\s*ал[^\s]*\s+қиын/i,
  /дем\s+ала\s+алмай/i,
  /тыныс[^\s]*\s+қиын/i,
  /есінен\s+тан/i,
  /қатты\s+ауыр/i,
  /кеуде.*ауыр/i,
  /can't\s+breathe/i,
  /cannot\s+breathe/i,
  /difficulty\s+breathing/i,
  /chest\s+pain/i,
  /unconscious/i,
  /heavy\s+bleeding/i,
];

const complaintPatterns = [
  /жалоб/i,
  /недовол/i,
  /хамств|груб(о|ый|ая)/i,
  /отврат|ужасн|безобраз/i,
  /шағым/i,
  /наразы/i,
  /complaint/i,
  /rude|terrible|awful|unacceptable/i,
];

/** Явная просьба соединить с человеком — не спорим, передаём. */
const humanRequestPatterns = [
  /оператор/i,
  /администрат/i,
  /живой\s+человек/i,
  /соедини(те)?\s+с\s+человек/i,
  /позов(и|ите)\s+человек/i,
  /нужен\s+человек/i,
  /адаммен\s+сөйлес/i,
  /оператормен/i,
  /нақты\s+адам/i,
  /real\s+person/i,
  /speak\s+to\s+(a\s+)?human/i,
  /talk\s+to\s+(an?\s+)?(operator|agent|human)/i,
];

/** Результаты анализов — чувствительные данные, не выдаём в самообслуживании. */
const sensitivePatterns = [
  /результат\w*.{0,15}анализ/i,
  /анализ\w*.{0,12}(готов|результат)/i,
  /мо[йиея]\w*\s+анализ/i,
  /талдау\w*.{0,12}нәтиж/i,
  /менің\s+анализ/i,
  /test\s+results?/i,
  /my\s+results?/i,
  /lab\s+results?/i,
];

const intentMatchers: Array<{ intent: PatientIntent; pattern: RegExp }> = [
  { intent: "reschedule", pattern: /перенес|перенос|друг[ое]*\s+врем|ауыстыр|reschedule|move.*appointment/i },
  { intent: "cancel", pattern: /отмен|отказ[ауеин]|болдырма|бас\s+тарт|cancel/i },
  { intent: "results", pattern: /результат\w*.{0,15}анализ|мо[йиея]\w*\s+анализ|нәтиж|test\s+results?|my\s+results?/i },
  { intent: "price", pattern: /цен|стоим|сколько\s+стоит|price|cost|баға|қанша\s+тұр/i },
  { intent: "address", pattern: /адрес|добра[тл]ься|как.{0,15}(добра|проех|дое[хж])|где.{0,10}наход|address|location|мекенжай|қайда/i },
  { intent: "preparation", pattern: /подготов|как\s+готов|натощак|prepare|preparation|дайынд/i },
  { intent: "schedule_info", pattern: /график|режим\s+работ|часы\s+работ|во\s+сколько\s+открыт|hours|жұмыс\s+уақыт/i },
  { intent: "find_doctor", pattern: /как(ой|ому)\s+врач|какому\s+специал|к\s+кому\s+обрат|which\s+doctor|қай\s+дәрігер|қай\s+маман/i },
  { intent: "appointment_info", pattern: /моя\s+запис|когда\s+у\s+меня|подтверд[иь]те\s+запис|my\s+appointment|менің\s+жазб/i },
  { intent: "book", pattern: /запис|записаться|при[её]м|слот|свободн[^\s]*\s+врем|appointment|book|жазыл|қабылдау/i },
];

export function detectIntent(text: string): PatientIntent {
  if (complaintPatterns.some((p) => p.test(text))) return "complaint";
  if (humanRequestPatterns.some((p) => p.test(text))) return "human";
  if (emergencyPatterns.some((p) => p.test(text))) return "urgent";
  for (const matcher of intentMatchers) {
    if (matcher.pattern.test(text)) return matcher.intent;
  }
  return "other";
}

/**
 * Решает, нужно ли передавать пациента человеку, и с какой причиной и
 * приоритетом. Богаче простого keyword-триггера: различает экстренный случай,
 * жалобу, явную просьбу о человеке и запрос чувствительных данных — от каждого
 * зависит и приоритет, и то, что увидит оператор в карточке.
 */
export function classifyEscalation(message: string): EscalationDecision {
  const text = message.trim();
  const intent = detectIntent(text);

  if (emergencyPatterns.some((p) => p.test(text))) {
    return { shouldEscalate: true, reason: "emergency", priority: "urgent", intent: "urgent" };
  }
  if (complaintPatterns.some((p) => p.test(text))) {
    return { shouldEscalate: true, reason: "complaint", priority: "high", intent: "complaint" };
  }
  if (humanRequestPatterns.some((p) => p.test(text))) {
    return { shouldEscalate: true, reason: "human_request", priority: "normal", intent: "human" };
  }
  if (sensitivePatterns.some((p) => p.test(text))) {
    return { shouldEscalate: true, reason: "sensitive_data", priority: "normal", intent: "results" };
  }

  return { shouldEscalate: false, reason: "other", priority: "low", intent };
}

/** Телефон в карточке оператора маскируется — виден только хвост. */
export function maskPhone(phone: string | null | undefined) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "•••";
  return `••• ${digits.slice(-4)}`;
}
