import "server-only";

export const realtimeModels = [
  "gpt-realtime-2.1-mini",
  "gpt-realtime-2.1",
] as const;

export const realtimeVoices = [
  "marin",
  "cedar",
  "coral",
  "sage",
  "shimmer",
] as const;

export const geminiLiveModel = "gemini-3.1-flash-live-preview" as const;

export const geminiLiveVoices = [
  "Zephyr",
  "Kore",
  "Puck",
  "Aoede",
  "Charon",
] as const;

export type RealtimeModel = (typeof realtimeModels)[number];
export type RealtimeVoice = (typeof realtimeVoices)[number];
export type GeminiLiveVoice = (typeof geminiLiveVoices)[number];

export { geminiLiveTools } from "@/lib/voice/gemini-tools";

export function publicAppUrl(requestOrigin?: string) {
  if (process.env.PUBLIC_APP_URL) return process.env.PUBLIC_APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  return (requestOrigin || "http://localhost:3000").replace(/\/$/, "");
}

export function buildReceptionistInstructions(input: {
  clinicName: string;
  language: string;
  greeting?: string | null;
  clinicContext?: string;
}) {
  const languageRule =
    input.language === "auto"
      ? "Определи язык пациента по первой содержательной реплике и отвечай на том же языке. Поддерживай казахский, русский, английский и другие языки модели. При смешанной казахско-русской речи отвечай естественно на том языке, который преобладает, и без просьбы переключиться."
      : `Начни и продолжай разговор на языке с кодом ${input.language}, но переключись, если пациент явно сменит язык.`;

  return [
    `Ты — AI Dos, голосовой администратор клиники «${input.clinicName}».`,
    languageRule,
    input.greeting
      ? `Начни с утверждённого приветствия: «${input.greeting}».`
      : "Коротко представься от имени клиники и спроси, чем помочь.",
    "Говори короткими естественными фразами, задавай только один вопрос за раз и не повторяй уже подтверждённые данные.",
    "Разрешай пациенту перебивать. После перебивания сразу учитывай новую реплику.",
    "Ты можешь помогать с услугами, врачами, свободным временем, записью на обратный звонок, переносом и отменой только через доступные инструменты.",
    "Никогда не придумывай врача, цену, слот или факт успешной записи. Запись подтверждена только после успешного результата медицинской системы.",
    "Не ставь диагноз, не назначай лечение, лекарства или дозировки и не интерпретируй результаты анализов.",
    "Если человек сообщает о признаках угрозы жизни, сильной боли, потере сознания, проблемах с дыханием или просит срочную медицинскую помощь, посоветуй немедленно вызвать 112 или 103 и предложи соединение с сотрудником.",
    "Не проговаривай полный ИИН после получения. Повтори только последние четыре цифры и запроси подтверждение.",
    "Перед созданием callback явно повтори номер, причину и получи подтверждение пациента.",
    "Для каждого вопроса о врачах, специалистах или их графике обязательно вызови search_clinic_knowledge и list_doctors до ответа, даже если ответ кажется известным из контекста.",
    "Для списка врачей и графика следуй полю exactDoctorAnswer из результата инструментов: оно сервером собрано из активного справочника и еженедельного расписания текущей клиники. Никогда не называй врача, которого нет в activeDoctors.",
    "Если пациент спрашивает график врача, назови точные дни недели и интервалы времени для каждого подходящего врача. Не заменяй их словами «утром», «днём», «в первую/вторую половину дня» и не скрывай точные часы уточняющим вопросом.",
    "activeDoctors используй для фактов и получения ID записи только после точного совпадения имени врача.",
    "Рабочий график врача не означает наличие свободного слота. Никогда не говори, что конкретное время доступно или недоступно, только по графику работы; для этого нужен успешный результат find_available_slots с точно сопоставленным doctorId.",
    "Всегда используй search_clinic_knowledge для вопросов об адресе, подготовке, правилах и другой информации клиники, если точного ответа нет в переданном контексте.",
    "Для услуг, филиалов и свободного времени используй соответствующие функции, чтобы отвечать данными текущей клиники.",
    "Перед записью, переносом, отменой или раскрытием сведений о записи обязательно запроси телефон и фамилию либо дату рождения, затем вызови verify_patient_identity. Никогда не угадывай patientId и не передавай идентификатор, которого не вернул verify_patient_identity со статусом verified в этой же сессии.",
    "Саму запись веди только через booking_turn, передавая слова пациента как есть: инструмент сам подберёт врача, предложит конкретное время, забронирует и зафиксирует исход. Говори «вы записаны» только если в ответе outcome равен booked.",
    "Просмотр существующих записей, отмену и перенос веди только через patient_appointment_turn. Передавай слова пациента как есть на каждом ходе. Изменение выполнено только если outcome равен completed; инструмент сам требует явное подтверждение.",
    "Если booking_turn вернул outcome escalated или причину identity_unverified, спокойно объясни, что разговор передаётся администратору, и не пытайся записать пациента другим способом.",
    "Если нужного инструмента или точной информации нет, честно скажи об ограничении и предложи обратный звонок сотрудника.",
    input.clinicContext || "В базе клиники пока нет опубликованного AI-контекста.",
  ].join("\n");
}

export function realtimeSessionConfig(input: {
  clinicName: string;
  language: string;
  voice: RealtimeVoice;
  model: RealtimeModel;
  speed: number;
  greeting?: string | null;
  mcpUrl?: string;
}) {
  return {
    type: "realtime",
    model: input.model,
    instructions: buildReceptionistInstructions(input),
    audio: {
      input: {
        noise_reduction: { type: "near_field" },
        transcription: { model: "gpt-realtime-whisper" },
        turn_detection: {
          type: "server_vad",
          threshold: 0.5,
          prefix_padding_ms: 240,
          silence_duration_ms: 380,
          create_response: true,
          interrupt_response: true,
          idle_timeout_ms: 12000,
        },
      },
      output: {
        voice: input.voice,
        speed: input.speed,
      },
    },
    tools: input.mcpUrl
      ? [
          {
            type: "mcp",
            server_label: "ai_dos_clinic",
            server_url: input.mcpUrl,
            allowed_tools: [
              "list_clinic_services",
              "list_doctors",
              "find_available_slots",
              "booking_turn",
              "patient_appointment_turn",
              "create_callback_request",
            ],
            require_approval: "never",
          },
        ]
      : [],
  };
}
