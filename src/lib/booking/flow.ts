import { classifyEscalation } from "@/lib/ai/escalation";
import { conversationLanguage, type SupportedLanguage } from "@/lib/ai/language";

export const bookingStages = [
  "need_doctor",
  "need_slot",
  // Слотов нет: спрашиваем, просить ли администратора принять вне графика.
  "urgent_ask",
  "confirming",
  // Запрос у администратора; диалог открыт, решение закроет его.
  "awaiting_urgent",
  "done",
] as const;
export type BookingStage = (typeof bookingStages)[number];

export const bookingOutcomes = ["booked", "lost", "escalated"] as const;
export type BookingOutcome = (typeof bookingOutcomes)[number];

/**
 * Причина, по которой пациент не записался. Пишется в момент, когда исход
 * случился, — поэтому это факт разговора, а не оценка по соседним таблицам.
 */
export const lostReasons = [
  "no_slot",
  "price",
  "no_doctor",
  "changed_mind",
  "wrong_time",
  "needs_human",
  "identity_unverified",
  "abandoned",
] as const;
export type LostReason = (typeof lostReasons)[number];

export type OfferedSlot = { startsAt: string; durationMinutes: number };

export type DoctorOption = {
  id: string;
  name: string;
  specialty: string | null;
};

export type BookingState = {
  stage: BookingStage;
  language: SupportedLanguage;
  doctorId: string | null;
  offeredSlots: OfferedSlot[];
  selectedStartsAt: string | null;
  /** Ходов подряд, которые не продвинули диалог. Два — повод закрыть честно. */
  misses: number;
};

export type BookingEffect =
  | { kind: "none" }
  | { kind: "book"; doctorId: string; startsAt: string }
  | { kind: "urgent"; doctorId: string | null }
  | {
      kind: "close";
      outcome: BookingOutcome;
      lostReason: LostReason | null;
      note: string | null;
    };

export type BookingTurn = {
  state: BookingState;
  reply: string;
  effect: BookingEffect;
};

export type BookingContext = {
  message: string;
  /** Активные врачи клиники — из них пациент выбирает. */
  doctors: DoctorOption[];
  /** Свободные слоты выбранного врача, перечитанные перед этим ходом. */
  slots: OfferedSlot[];
  timeZone: string;
};

const SLOTS_PER_OFFER = 3;
const MAX_MISSES = 2;

export function initialBookingState(language: SupportedLanguage = "ru"): BookingState {
  return {
    stage: "need_doctor",
    language,
    doctorId: null,
    offeredSlots: [],
    selectedStartsAt: null,
    misses: 0,
  };
}

/* ------------------------------------------------------------------ разбор */

const priceRefusalPatterns = [
  /дорог(о|ая|ой|овато)/i,
  /слишком\s+дорог/i,
  /не\s+по\s+карман/i,
  /цена\s+(не\s+устраивает|высок|большая)/i,
  /дешевле\s+(есть|найд)/i,
  /қымбат/i,
  /арзан\w*\s+жер/i,
  /too\s+expensive/i,
  /(that'?s|it'?s)\s+expensive/i,
  /can'?t\s+afford/i,
];

const changedMindPatterns = [
  /передума/i,
  /не\s*надо/i,
  /не\s*нужно/i,
  /уже\s+не\s+актуал/i,
  /отка(зываюсь|жусь)/i,
  /отмен(и|ите|яю|яем)/i,
  /потом\s+(запишусь|решу)/i,
  /ойым(ды)?\s+өзгерт/i,
  /керек\s*емес/i,
  /қаж(е|ә)т\s*емес/i,
  /changed\s+my\s+mind/i,
  /never\s*mind/i,
  /not\s+(now|anymore)/i,
  /no\s+longer\s+need/i,
];

/**
 * Явный отказ от самой записи — в отличие от «не подходит это время», которое
 * ещё лечится следующей подборкой слотов.
 */
export function detectLostSignal(text: string): LostReason | null {
  if (priceRefusalPatterns.some((pattern) => pattern.test(text))) return "price";
  if (changedMindPatterns.some((pattern) => pattern.test(text))) return "changed_mind";
  return null;
}

const yesPatterns = [
  /^\s*(да|ага|угу|ок|окей|хорошо|давай(те)?|подтвержд|подходит|годится|верно|запиш)/i,
  /^\s*(и[әэ]|ия|жарайды|болады|дұрыс|келісемін|макул|мақұл)/i,
  /^\s*(yes|yeah|yep|ok|okay|sure|confirm|book\s+it|sounds\s+good)/i,
];

const noPatterns = [
  /^\s*(нет|неа|не\s|не$|друг|поздн|ран)/i,
  /не\s+подход/i,
  /неудобн/i,
  /^\s*(жоқ|басқа)/i,
  /ыңғайсыз/i,
  /^\s*(no|nope|another|different)/i,
  /does\s*n'?o?t\s+work/i,
];

export function parseConfirmation(text: string): "yes" | "no" | "unclear" {
  const value = text.trim();
  if (noPatterns.some((pattern) => pattern.test(value))) return "no";
  if (yesPatterns.some((pattern) => pattern.test(value))) return "yes";
  return "unclear";
}

// Границы слов задаём через юникод-классы: `\b` в JS считает буквой только
// ASCII, поэтому на кириллице и казахских буквах он не срабатывает.
const ordinalPatterns: Array<{ index: number; pattern: RegExp }> = [
  { index: 0, pattern: /(?<!\p{L})(перв(ый|ое|ую|ым)|бірінші|first)(?!\p{L})/iu },
  { index: 1, pattern: /(?<!\p{L})(втор(ой|ое|ую|ым)|екінші|second)(?!\p{L})/iu },
  { index: 2, pattern: /(?<!\p{L})(трет(ий|ье|ью|ьим)|үшінші|third)(?!\p{L})/iu },
];

function slotClock(startsAt: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(new Date(startsAt));
}

function slotDay(startsAt: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).format(new Date(startsAt));
}

/** Дата «сегодня»/«завтра» в часовом поясе клиники, а не сервера. */
function relativeDay(offsetDays: number, timeZone: string, now: number) {
  return slotDay(new Date(now + offsetDays * 86_400_000).toISOString(), timeZone);
}

/**
 * Пациент отвечает как человек: «второй», «в 14:30», «завтра утром подойдёт».
 * Разбираем номер в списке, точное время и день — по тем слотам, которые он
 * реально увидел.
 */
export function parseSlotChoice(
  text: string,
  offers: OfferedSlot[],
  timeZone: string,
  now = Date.now(),
): OfferedSlot | null {
  if (!offers.length) return null;
  const value = text.trim();

  for (const { index, pattern } of ordinalPatterns) {
    if (pattern.test(value) && offers[index]) return offers[index];
  }

  const bare = value.match(/(?:^|[^\d:.])([1-9])(?![\d:.])/);
  const hasTime = /\d{1,2}\s*[:.]\s*\d{2}/.test(value);
  if (!hasTime && bare) {
    const index = Number(bare[1]) - 1;
    if (index >= 0 && index < offers.length) return offers[index];
  }

  const dayFilter =
    /завтра|ертең|tomorrow/i.test(value)
      ? relativeDay(1, timeZone, now)
      : /сегодня|бүгін|today/i.test(value)
        ? relativeDay(0, timeZone, now)
        : null;
  const scoped = dayFilter
    ? offers.filter((slot) => slotDay(slot.startsAt, timeZone) === dayFilter)
    : offers;
  if (!scoped.length) return null;

  // «Не надо в 9, давайте в 10» — решающим считаем последнее названное время.
  const exact = [...value.matchAll(/(\d{1,2})\s*[:.]\s*(\d{2})/g)];
  if (exact.length) {
    for (const found of exact.reverse()) {
      const clock = `${found[1].padStart(2, "0")}:${found[2]}`;
      const match = scoped.find((slot) => slotClock(slot.startsAt, timeZone) === clock);
      if (match) return match;
    }
    return null;
  }

  const hourOnly = [
    ...value.matchAll(/(?<!\p{L})(?:в|на|сағат|at)\s+(\d{1,2})(?:\s*(?:час\p{L}*|ч))?(?!\p{L}|\d)/giu),
  ];
  if (hourOnly.length) {
    for (const found of hourOnly.reverse()) {
      const hour = found[1].padStart(2, "0");
      const match = scoped.find((slot) =>
        slotClock(slot.startsAt, timeZone).startsWith(`${hour}:`),
      );
      if (match) return match;
    }
    return null;
  }

  if (dayFilter && scoped.length) return scoped[0];
  return null;
}

function normalize(value: string) {
  return value.toLocaleLowerCase("ru-KZ");
}

/**
 * Пациент склоняет слова: «к Нурлановой», «кардиологу». Сравниваем по основе —
 * без окончания, — иначе точное совпадение не находится почти никогда.
 */
function stem(token: string) {
  return token.slice(0, Math.max(4, token.length - 2));
}

/** Врач по фамилии или специальности из фразы пациента. */
export function matchDoctor(text: string, doctors: DoctorOption[]): DoctorOption | null {
  if (!doctors.length) return null;
  const lowered = normalize(text);
  let best: { doctor: DoctorOption; score: number } | undefined;

  for (const doctor of doctors) {
    let score = 0;
    for (const token of normalize(doctor.name).split(/[^\p{L}\p{N}]+/u)) {
      if (token.length >= 5 && lowered.includes(stem(token))) score += 3;
    }
    if (doctor.specialty) {
      for (const token of normalize(doctor.specialty).split(/[^\p{L}\p{N}]+/u)) {
        if (token.length >= 5 && lowered.includes(stem(token))) score += 2;
      }
    }
    if (score > 0 && (!best || score > best.score)) best = { doctor, score };
  }

  return best?.doctor ?? null;
}

/* ---------------------------------------------------------------- реплики */

function formatSlotLabel(
  startsAt: string,
  language: SupportedLanguage,
  timeZone: string,
) {
  const locale = language === "kk" ? "kk-KZ" : language === "en" ? "en-US" : "ru-RU";
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(new Date(startsAt));
}

function slotList(
  slots: OfferedSlot[],
  language: SupportedLanguage,
  timeZone: string,
) {
  return slots
    .map((slot, index) => `${index + 1}) ${formatSlotLabel(slot.startsAt, language, timeZone)}`)
    .join("; ");
}

function doctorList(doctors: DoctorOption[]) {
  return doctors
    .slice(0, 6)
    .map((doctor) => `${doctor.name}${doctor.specialty ? ` (${doctor.specialty})` : ""}`)
    .join("; ");
}

function pick(
  language: SupportedLanguage,
  ru: string,
  kk: string,
  en: string,
) {
  return language === "kk" ? kk : language === "en" ? en : ru;
}

/* ----------------------------------------------------------------- машина */

function close(
  state: BookingState,
  outcome: BookingOutcome,
  lostReason: LostReason | null,
  reply: string,
  note: string | null = null,
): BookingTurn {
  return {
    state: { ...state, stage: "done" },
    reply,
    effect: { kind: "close", outcome, lostReason, note },
  };
}

function offerSlots(
  state: BookingState,
  slots: OfferedSlot[],
  language: SupportedLanguage,
  timeZone: string,
  lead: { ru: string; kk: string; en: string },
): BookingTurn {
  const list = slotList(slots, language, timeZone);
  return {
    state: { ...state, stage: "need_slot", offeredSlots: slots, selectedStartsAt: null },
    reply: `${pick(language, lead.ru, lead.kk, lead.en)} ${list}. ${pick(
      language,
      "Какое время подходит?",
      "Қай уақыт ыңғайлы?",
      "Which time works for you?",
    )}`,
    effect: { kind: "none" },
  };
}

/**
 * Свободного времени нет — но клиника обычно умеет вписать пациента вне
 * графика. Вместо отказа спрашиваем и, при согласии, отдаём решение
 * администратору.
 */
function noSlotTurn(state: BookingState, language: SupportedLanguage): BookingTurn {
  return {
    state: { ...state, stage: "urgent_ask", offeredSlots: [], selectedStartsAt: null },
    reply: pick(
      language,
      "Свободного времени у этого врача сейчас нет. Могу попросить администратора принять вас вне графика — или поставить в лист ожидания. Попросить администратора?",
      "Бұл дәрігерде қазір бос уақыт жоқ. Әкімшіден кесте сыртында қабылдауды сұрай аламын немесе кезекке қоямын. Әкімшіден сұрайын ба?",
      "This doctor has no free time right now. I can ask an administrator to fit you in outside the schedule, or add you to the waitlist. Shall I ask the administrator?",
    ),
    effect: { kind: "none" },
  };
}

function waitlistCloseTurn(state: BookingState, language: SupportedLanguage): BookingTurn {
  return close(
    state,
    "lost",
    "no_slot",
    pick(
      language,
      "Хорошо, ставлю вас в лист ожидания — как только слот освободится, мы предложим его первым.",
      "Жақсы, сізді кезекке қоямын — орын босаған бойда бірінші болып ұсынамыз.",
      "All right, I’m adding you to the waitlist — we’ll offer the first slot that frees up.",
    ),
  );
}

/**
 * Один ход разговорной записи. Функция чистая: всё, что нужно из базы —
 * врачи и свежие слоты — приходит в контексте, а наружу уходит эффект,
 * который выполняет вызывающий слой (забронировать или закрыть с исходом).
 */
export function advanceBooking(state: BookingState, ctx: BookingContext): BookingTurn {
  const text = ctx.message.trim();
  const language = conversationLanguage(text, state.language);
  const current: BookingState = { ...state, language };

  if (current.stage === "done") {
    return {
      state: current,
      reply: pick(
        language,
        "Этот запрос уже закрыт. Начните новый, если нужна ещё одна запись.",
        "Бұл өтініш жабылды. Тағы жазылу қажет болса, жаңасын бастаңыз.",
        "This request is already closed. Start a new one if you need another appointment.",
      ),
      effect: { kind: "none" },
    };
  }

  // Экстренный случай, жалоба и просьба о человеке идут вперёд любой записи.
  const escalation = classifyEscalation(text);
  if (escalation.shouldEscalate) {
    return close(
      current,
      "escalated",
      null,
      escalation.reason === "emergency"
        ? pick(
            language,
            "Это может быть экстренная ситуация. Позвоните 112 или 103 прямо сейчас. Я передаю разговор сотруднику клиники.",
            "Бұл шұғыл жағдай болуы мүмкін. Қазір 112 немесе 103 нөміріне қоңырау шалыңыз. Диалогты клиника қызметкеріне беремін.",
            "This may be an emergency. Call 112 or 103 now. I’m handing this conversation to clinic staff.",
          )
        : pick(
            language,
            "Передаю разговор администратору — он продолжит с этого места.",
            "Диалогты әкімшіге беремін — ол осы жерден жалғастырады.",
            "I’m handing this to an administrator — they will continue from here.",
          ),
      escalation.reason,
    );
  }

  // Выбор конкретного слота читаем раньше отказа: «не надо в 10, давайте в 14»
  // — это уточнение времени, а не отказ от записи.
  const slotChoice =
    current.stage === "need_slot" || current.stage === "confirming"
      ? parseSlotChoice(text, current.offeredSlots, ctx.timeZone)
      : null;

  // «Нет, не нужно» в ответ на предложение спросить администратора — это ответ
  // на вопрос, а не отказ от записи: причиной остаётся отсутствие слотов.
  const answersUrgentAsk =
    current.stage === "urgent_ask" && parseConfirmation(text) !== "unclear";

  const lost = slotChoice || answersUrgentAsk ? null : detectLostSignal(text);
  if (lost) {
    return close(
      current,
      "lost",
      lost,
      lost === "price"
        ? pick(
            language,
            "Понимаю. Записал причину — цена. Если захотите, подберём услугу дешевле или другого специалиста.",
            "Түсіндім. Себебін жаздым — баға. Қаласаңыз, арзанырақ қызмет немесе басқа маман таңдаймыз.",
            "Understood. I’ve recorded the reason — price. If you like, we can look at a cheaper service or another specialist.",
          )
        : pick(
            language,
            "Хорошо, запись отменяю. Обращайтесь, когда будет удобно.",
            "Жақсы, жазылуды тоқтатамын. Ыңғайлы кезде хабарласыңыз.",
            "All right, I’m cancelling the request. Reach out whenever it suits you.",
          ),
      text.slice(0, 300),
    );
  }

  if (current.stage === "awaiting_urgent") {
    return {
      state: current,
      reply: pick(
        language,
        "Запрос уже у администратора клиники. Как только он ответит, я сразу сообщу.",
        "Сұрау клиника әкімшісінде. Жауап келген бойда хабарлаймын.",
        "The request is already with the clinic administrator. I’ll let you know as soon as they respond.",
      ),
      effect: { kind: "none" },
    };
  }

  if (current.stage === "urgent_ask") {
    if (parseConfirmation(text) === "yes") {
      return {
        state: { ...current, stage: "awaiting_urgent", misses: 0 },
        reply: pick(
          language,
          "Передаю запрос администратору — он решит, можно ли принять вас вне графика, и я сообщу ответ.",
          "Сұрауды әкімшіге беремін — ол кесте сыртында қабылдау мүмкін бе екенін шешеді, жауабын хабарлаймын.",
          "I’m passing the request to an administrator — they will decide whether you can be seen outside the schedule, and I’ll tell you the answer.",
        ),
        effect: { kind: "urgent", doctorId: current.doctorId },
      };
    }
    return waitlistCloseTurn(current, language);
  }

  if (current.stage === "need_doctor") {
    if (!ctx.doctors.length) {
      return close(
        current,
        "lost",
        "no_doctor",
        pick(
          language,
          "Сейчас в клинике нет активного врача под этот запрос. Передам заявку администратору, чтобы он предложил вариант.",
          "Қазір бұл сұраныс бойынша белсенді дәрігер жоқ. Өтінішті әкімшіге беремін, ол нұсқа ұсынады.",
          "There is no active doctor for this request right now. I’ll pass it to an administrator to suggest an option.",
        ),
      );
    }

    const doctor =
      matchDoctor(text, ctx.doctors) ?? (ctx.doctors.length === 1 ? ctx.doctors[0] : null);
    if (!doctor) {
      const misses = current.misses + 1;
      if (misses >= MAX_MISSES) {
        return close(
          current,
          "escalated",
          null,
          pick(
            language,
            "Чтобы не гадать, передаю разговор администратору — он подберёт врача вместе с вами.",
            "Болжамай, диалогты әкімшіге беремін — ол дәрігерді сізбен бірге таңдайды.",
            "Rather than guess, I’m handing this to an administrator who will pick the doctor with you.",
          ),
          "doctor_not_recognized",
        );
      }
      return {
        state: { ...current, misses },
        reply: `${pick(
          language,
          "Подскажите врача или специальность. Принимают:",
          "Дәрігерді немесе мамандықты айтыңыз. Қабылдайтындар:",
          "Tell me the doctor or specialty. Available:",
        )} ${doctorList(ctx.doctors)}.`,
        effect: { kind: "none" },
      };
    }

    const slots = ctx.slots.slice(0, SLOTS_PER_OFFER);
    const chosen: BookingState = { ...current, doctorId: doctor.id, misses: 0 };
    if (!slots.length) return noSlotTurn(chosen, language);

    return offerSlots(chosen, slots, language, ctx.timeZone, {
      ru: `Ближайшее свободное время — ${doctor.name}:`,
      kk: `Ең жақын бос уақыт — ${doctor.name}:`,
      en: `Nearest available times with ${doctor.name}:`,
    });
  }

  if (slotChoice) {
    return {
      state: { ...current, stage: "confirming", selectedStartsAt: slotChoice.startsAt, misses: 0 },
      reply: `${pick(
        language,
        "Подтвердите запись:",
        "Жазылуды растаңыз:",
        "Please confirm the appointment:",
      )} ${formatSlotLabel(slotChoice.startsAt, language, ctx.timeZone)}. ${pick(
        language,
        "Записываю?",
        "Жазайын ба?",
        "Shall I book it?",
      )}`,
      effect: { kind: "none" },
    };
  }

  if (current.stage === "need_slot") {
    const misses = current.misses + 1;
    const offeredKeys = new Set(current.offeredSlots.map((slot) => slot.startsAt));
    const next = ctx.slots
      .filter((slot) => !offeredKeys.has(slot.startsAt))
      .slice(0, SLOTS_PER_OFFER);

    if (misses >= MAX_MISSES || !next.length) {
      return close(
        { ...current, misses },
        "lost",
        "wrong_time",
        pick(
          language,
          "Подходящего времени не нашли. Ставлю вас в лист ожидания и сообщу, когда освободится удобный слот.",
          "Ыңғайлы уақыт табылмады. Сізді кезекке қоямын, орын босағанда хабарлаймын.",
          "We couldn’t find a suitable time. I’m adding you to the waitlist and will tell you when a convenient slot frees up.",
        ),
      );
    }

    return offerSlots({ ...current, misses }, next, language, ctx.timeZone, {
      ru: "Тогда другие варианты:",
      kk: "Онда басқа нұсқалар:",
      en: "Then here are other options:",
    });
  }

  // confirming
  const answer = current.selectedStartsAt ? parseConfirmation(text) : "no";
  if (answer === "yes" && current.doctorId && current.selectedStartsAt) {
    return {
      state: current,
      reply: "",
      effect: {
        kind: "book",
        doctorId: current.doctorId,
        startsAt: current.selectedStartsAt,
      },
    };
  }

  const misses = current.misses + 1;
  if (answer === "unclear" && current.selectedStartsAt && misses < MAX_MISSES) {
    return {
      state: { ...current, misses },
      reply: `${pick(
        language,
        "Уточните, пожалуйста: записываю на",
        "Нақтылаңызшы: мына уақытқа жазайын ба —",
        "Just to confirm: shall I book",
      )} ${formatSlotLabel(current.selectedStartsAt, language, ctx.timeZone)}? ${pick(
        language,
        "Ответьте «да» или «нет».",
        "«Иә» немесе «жоқ» деп жауап беріңіз.",
        "Please answer yes or no.",
      )}`,
      effect: { kind: "none" },
    };
  }

  const offeredKeys = new Set(current.offeredSlots.map((slot) => slot.startsAt));
  const next = ctx.slots
    .filter((slot) => !offeredKeys.has(slot.startsAt))
    .slice(0, SLOTS_PER_OFFER);
  if (misses >= MAX_MISSES || !next.length) {
    return close(
      { ...current, misses },
      "lost",
      "wrong_time",
      pick(
        language,
        "Хорошо. Подходящего времени сейчас нет — поставлю вас в лист ожидания.",
        "Жақсы. Қазір ыңғайлы уақыт жоқ — сізді кезекке қоямын.",
        "All right. There is no suitable time right now — I’ll add you to the waitlist.",
      ),
    );
  }

  return offerSlots({ ...current, misses }, next, language, ctx.timeZone, {
    ru: "Хорошо, другие варианты:",
    kk: "Жақсы, басқа нұсқалар:",
    en: "All right, other options:",
  });
}

/** Запись подтверждена системой — только теперь говорим пациенту «готово». */
export function bookedTurn(
  state: BookingState,
  startsAt: string,
  timeZone: string,
): BookingTurn {
  return {
    state: { ...state, stage: "done", selectedStartsAt: startsAt },
    reply: `${pick(
      state.language,
      "Готово, вы записаны:",
      "Дайын, сіз жазылдыңыз:",
      "Done, you are booked:",
    )} ${formatSlotLabel(startsAt, state.language, timeZone)}. ${pick(
      state.language,
      "Напоминание придёт заранее.",
      "Еске салуды алдын ала жібереміз.",
      "You’ll get a reminder in advance.",
    )}`,
    effect: { kind: "close", outcome: "booked", lostReason: null, note: null },
  };
}

/** Слот заняли между показом и подтверждением — предлагаем оставшиеся. */
export function slotTakenTurn(
  state: BookingState,
  slots: OfferedSlot[],
  timeZone: string,
): BookingTurn {
  const available = slots.slice(0, SLOTS_PER_OFFER);
  if (!available.length) return noSlotTurn(state, state.language);
  return offerSlots(
    { ...state, misses: state.misses },
    available,
    state.language,
    timeZone,
    {
      ru: "Это время только что заняли. Свободно ещё:",
      kk: "Бұл уақытты жаңа ғана алып қойды. Тағы бос:",
      en: "That time was just taken. Still available:",
    },
  );
}

/** Пациент не подтверждён — данными о записи не рискуем, зовём человека. */
export function identityBlockedTurn(state: BookingState): BookingTurn {
  return close(
    state,
    "lost",
    "identity_unverified",
    pick(
      state.language,
      "Для завершения записи нужно подтвердить личность. Передаю разговор администратору клиники.",
      "Жазылуды аяқтау үшін жеке басты растау керек. Диалогты клиника әкімшісіне беремін.",
      "Completing the booking requires identity verification. I’m handing this to a clinic administrator.",
    ),
  );
}
