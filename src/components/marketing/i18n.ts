export const locales = ["ru", "kk", "en"] as const;
export type Locale = (typeof locales)[number];

export const localeNames: Record<Locale, string> = {
  ru: "Русский",
  kk: "Қазақша",
  en: "English",
};

/** Короткая метка для переключателя. */
export const localeShort: Record<Locale, string> = {
  ru: "RU",
  kk: "KZ",
  en: "EN",
};

type Timeline = { time: string; text: string; muted?: boolean };
type Item = { title: string; body: string };
type NightItem = { time: string; title: string; body: string };
type DialogueLine = { who: string; text: string; lang: string };

export type Dictionary = {
  nav: { evening: string; call: string; voice: string; limits: string };
  cta: { login: string; create: string; how: string };
  hero: {
    eyebrow: string;
    titleTop: string;
    titleAccent: string;
    lead: string;
    scrollHint: string;
    railStart: string;
  };
  promises: Item[];
  evening: {
    mark: string;
    title: string;
    lead: string;
    nowLabel: string;
    usLabel: string;
    without: Timeline[];
    withUs: Timeline[];
    quote: string;
  };
  call: { mark: string; title: string; lead: string; steps: Item[] };
  voice: {
    mark: string;
    titleTop: string;
    titleAccent: string;
    dialogue: DialogueLine[];
    note: string;
    features: Item[];
  };
  night: { mark: string; title: string; lead: string; items: NightItem[] };
  limits: {
    mark: string;
    titleTop: string;
    titleAccent: string;
    lead: string;
    items: Item[];
  };
  ground: {
    mark: string;
    title: string;
    items: Item[];
    apiEyebrow: string;
    apiTitle: string;
    apiBody: string;
  };
  final: { titleTop: string; titleAccent: string; lead: string };
  footer: { disclaimer: string; login: string; register: string };
};

const ru: Dictionary = {
  nav: { evening: "Вечер", call: "Звонок", voice: "Голос", limits: "Границы" },
  cta: { login: "Войти", create: "Создать клинику", how: "Как это работает" },
  hero: {
    eyebrow: "AI-регистратура · Казахстан",
    titleTop: "Клиника закрывается в семь.",
    titleAccent: "Пациенты — нет.",
    lead: "AI Dos отвечает на звонки и сообщения тогда, когда регистратура уже ушла домой: уточняет запрос, находит свободное окно и подтверждает запись. На казахском, русском и английском.",
    scrollHint: "Листайте — история ниже",
    railStart: "Начало",
  },
  promises: [
    {
      title: "Круглосуточно",
      body: "Звонок в 23:40 обрабатывается так же, как в 11:00 — без автоответчика и очереди.",
    },
    {
      title: "Три языка",
      body: "Пациент переходит на казахский посреди фразы — разговор не прерывается.",
    },
    {
      title: "Человек в контуре",
      body: "Всё, что выходит за рамки записи, уходит сотруднику вместе с контекстом.",
    },
  ],
  evening: {
    mark: "Вечер",
    title: "Один вечер из жизни регистратуры",
    lead: "Ничего драматичного не происходит. Просто телефон звонит после закрытия — и дальше всё зависит от того, кто снимет трубку.",
    nowLabel: "Как сейчас",
    usLabel: "С AI Dos",
    without: [
      { time: "18:40", text: "Пациент набирает номер клиники." },
      { time: "18:41", text: "Двенадцать гудков. Автоответчик просит перезвонить утром." },
      { time: "18:44", text: "Второй звонок — на всякий случай. Тот же результат." },
      { time: "18:47", text: "Он открывает карты и звонит в клинику через дорогу." },
      { time: "09:00", text: "Регистратура выходит на смену. О звонке никто не узнает.", muted: true },
    ],
    withUs: [
      { time: "18:40", text: "Пациент набирает номер клиники." },
      { time: "18:40", text: "AI Dos отвечает и слышит казахский — переходит на него." },
      { time: "18:41", text: "Находит три свободных окна у нужного специалиста." },
      { time: "18:42", text: "Запись подтверждена. Пациент получает время и адрес." },
      { time: "09:00", text: "Регистратура выходит на смену и видит готовую запись." },
    ],
    quote: "Пропущенный звонок — это не пропущенный звонок. Это пациент, который записался в соседнюю клинику.",
  },
  call: {
    mark: "Звонок",
    title: "Сорок секунд, из которых состоит запись",
    lead: "Разговор выглядит просто, потому что сложное спрятано внутри: проверка расписания, защита от двойной записи и решение, когда звать человека.",
    steps: [
      {
        title: "Слышит запрос",
        body: "Пациент говорит своими словами: «болит горло второй день, хочу к лору». Никаких кнопок и меню.",
      },
      {
        title: "Уточняет ровно необходимое",
        body: "Имя, телефон, удобное время. ИИН и медицинские подробности не запрашиваются — они не нужны, чтобы записать.",
      },
      {
        title: "Смотрит в живое расписание",
        body: "Свободные окна берутся из расписания врача с учётом отпусков и уже занятых слотов.",
      },
      {
        title: "Держит слот",
        body: "Два пациента не получат одно время: пересечение записей запрещено на уровне базы, а не проверкой в коде.",
      },
      {
        title: "Подтверждает или передаёт",
        body: "Обычная запись закрывается сразу. Срочный или спорный случай уходит сотруднику — с расшифровкой разговора.",
      },
    ],
  },
  voice: {
    mark: "Голос",
    titleTop: "Три языка.",
    titleAccent: "Один разговор.",
    dialogue: [
      { who: "Пациент", text: "Здравствуйте, мне нужно к терапевту на этой неделе.", lang: "RU" },
      { who: "AI Dos", text: "Конечно. Есть вторник в 11:20 и среда в 14:40 — что удобнее?", lang: "RU" },
      { who: "Пациент", text: "Сейсенбі болады. Ертең қоңырау шалуға бола ма?", lang: "KZ" },
      { who: "AI Dos", text: "Сейсенбі 11:20-ға жаздым. Ертең еске салып, хабарласамын.", lang: "KZ" },
    ],
    note: "Пациент перешёл на казахский на третьей реплике. Ассистент перешёл вместе с ним и сохранил уже собранный контекст.",
    features: [
      {
        title: "Язык определяется сам",
        body: "Ассистент не спрашивает «нажмите 1 для русского». Он слышит язык и отвечает на нём.",
      },
      {
        title: "Пациента можно перебить",
        body: "Если человек начинает говорить поверх ответа, ассистент замолкает — как это делает живой оператор.",
      },
      {
        title: "Задержка измеряется",
        body: "Время до первого звука фиксируется в каждой сессии. Медленный разговор виден в отчётах, а не на слух.",
      },
    ],
  },
  night: {
    mark: "Ночь",
    title: "Пока клиника спит",
    lead: "Часть работы регистратуры не требует разговора — но требует, чтобы кто-то о ней помнил. Этим занимаются фоновые процессы.",
    items: [
      {
        time: "21:15",
        title: "Освободилось окно",
        body: "Пациент отменил визит. Система находит подходящего человека из листа ожидания и отправляет предложение со сроком действия.",
      },
      {
        time: "03:00",
        title: "Напоминание собрано",
        body: "Визиты завтрашнего дня получают напоминание — оно отправится за сутки до приёма, а не посреди ночи.",
      },
      {
        time: "08:20",
        title: "Пропущенный визит закрыт",
        body: "Пациент не пришёл — визит помечен, а сотруднику готова задача связаться и предложить новое время.",
      },
    ],
  },
  limits: {
    mark: "Границы",
    titleTop: "Чего AI Dos",
    titleAccent: "не делает",
    lead: "В медицине отказ важнее возможности. Эти ограничения заложены в продукт, а не оставлены на усмотрение модели.",
    items: [
      {
        title: "Не ставит диагноз",
        body: "Не толкует симптомы, не назначает лечение и не комментирует анализы. При тревожных признаках сразу направляет к экстренной помощи и зовёт человека.",
      },
      {
        title: "Не выдумывает интеграцию",
        body: "Пока клиника не получила официальный API DAMUMED, адаптер честно показывает «ожидает доступ» вместо имитации обмена данными.",
      },
      {
        title: "Не говорит «отправлено» заранее",
        body: "Уведомление считается доставленным только после ответа провайдера. Без учётных данных оно ждёт в очереди с понятным статусом.",
      },
      {
        title: "Не звонит без согласия",
        body: "Предложение свободного окна уходит наружу только тем, кто зафиксировал согласие. Остальные остаются задачей для регистратуры.",
      },
    ],
  },
  ground: {
    mark: "Основание",
    title: "То, что не видно пациенту",
    items: [
      {
        title: "Изоляция клиник",
        body: "Данные каждого рабочего пространства отделены на уровне запросов и политик базы.",
      },
      {
        title: "Роли и права",
        body: "Администратор, оператор и врач видят разные разделы и разные действия.",
      },
      {
        title: "Журнал действий",
        body: "Кто изменил запись, когда и почему — фиксируется без дублирования медицинских данных.",
      },
      {
        title: "Ключи на сервере",
        body: "Секреты провайдеров не попадают в браузер, сессии живут в HttpOnly-cookie.",
      },
    ],
    apiEyebrow: "Ожидает официальный API",
    apiTitle: "Интеграция с DAMUMED готова, но не притворяется работающей",
    apiBody: "Контракт адаптера, перенос записи и проверка после сохранения уже написаны. Как только клиника получит документацию и доступ, останется подключить endpoints — без выдуманных полей и обещаний, которые нечем подтвердить.",
  },
  final: {
    titleTop: "Верните команде время",
    titleAccent: "на пациентов",
    lead: "Рабочее пространство создаётся за минуту. Телефония, WhatsApp и МИС подключаются отдельно, когда у клиники появятся доступы.",
  },
  footer: {
    disclaimer: "AI-регистратура для клиник Казахстана. Не является медицинским изделием и не ставит диагнозы.",
    login: "Войти",
    register: "Регистрация",
  },
};

const kk: Dictionary = {
  nav: { evening: "Кеш", call: "Қоңырау", voice: "Дауыс", limits: "Шектер" },
  cta: { login: "Кіру", create: "Клиника құру", how: "Қалай жұмыс істейді" },
  hero: {
    eyebrow: "AI-тіркеу · Қазақстан",
    titleTop: "Клиника жетіде жабылады.",
    titleAccent: "Науқастар — жоқ.",
    lead: "AI Dos тіркеу үйге кеткен уақытта да қоңыраулар мен хабарламаларға жауап береді: сұранысты нақтылайды, бос уақыт табады және жазуды растайды. Қазақ, орыс және ағылшын тілдерінде.",
    scrollHint: "Төмен қарай парақтаңыз — оқиға төменде",
    railStart: "Бастау",
  },
  promises: [
    {
      title: "Тәулік бойы",
      body: "23:40-тағы қоңырау 11:00-дегідей өңделеді — автожауапсыз және кезексіз.",
    },
    {
      title: "Үш тіл",
      body: "Науқас сөз ортасында қазақшаға көшеді — әңгіме үзілмейді.",
    },
    {
      title: "Адам — контурда",
      body: "Жазудан тыс барлық жайт контекстімен бірге қызметкерге жіберіледі.",
    },
  ],
  evening: {
    mark: "Кеш",
    title: "Тіркеудің бір кеші",
    lead: "Ешқандай драма жоқ. Жай ғана телефон жабылғаннан кейін шырылдайды — ал әрі қарайғысы трубканы кім көтеретініне байланысты.",
    nowLabel: "Қазір қалай",
    usLabel: "AI Dos-пен",
    without: [
      { time: "18:40", text: "Науқас клиника нөмірін тереді." },
      { time: "18:41", text: "Он екі гудок. Автожауап таңертең қайта қоңырау шалуды сұрайды." },
      { time: "18:44", text: "Екінші қоңырау — әйтеуір. Нәтиже сол." },
      { time: "18:47", text: "Ол картаны ашып, көрші клиникаға қоңырау шалады." },
      { time: "09:00", text: "Тіркеу жұмысқа шығады. Қоңырау туралы ешкім білмейді.", muted: true },
    ],
    withUs: [
      { time: "18:40", text: "Науқас клиника нөмірін тереді." },
      { time: "18:40", text: "AI Dos жауап беріп, қазақ тілін естиді — соған көшеді." },
      { time: "18:41", text: "Қажет маманнан үш бос уақыт табады." },
      { time: "18:42", text: "Жазу расталды. Науқас уақыт пен мекенжайды алады." },
      { time: "09:00", text: "Тіркеу жұмысқа шығып, дайын жазуды көреді." },
    ],
    quote: "Өткізіп алған қоңырау — жай өткізіп алған қоңырау емес. Бұл — көрші клиникаға жазылған науқас.",
  },
  call: {
    mark: "Қоңырау",
    title: "Жазу құралатын қырық секунд",
    lead: "Әңгіме қарапайым көрінеді, өйткені күрделі нәрсе ішінде жасырын: кестені тексеру, қос жазудан қорғау және адамды қашан шақыру керектігі туралы шешім.",
    steps: [
      {
        title: "Сұранысты естиді",
        body: "Науқас өз сөзімен айтады: «екінші күн тамағым ауырады, лорға барғым келеді». Ешқандай батырма мен мәзір жоқ.",
      },
      {
        title: "Тек қажеттісін нақтылайды",
        body: "Аты, телефоны, ыңғайлы уақыты. ЖСН мен медициналық мәліметтер сұралмайды — жазу үшін олар қажет емес.",
      },
      {
        title: "Тірі кестеге қарайды",
        body: "Бос уақыттар дәрігердің кестесінен демалыс пен бос емес слоттарды ескере отырып алынады.",
      },
      {
        title: "Слотты ұстайды",
        body: "Екі науқас бір уақытты ала алмайды: жазулардың қиылысуы кодтағы тексеру арқылы емес, дерекқор деңгейінде тыйым салынған.",
      },
      {
        title: "Растайды немесе береді",
        body: "Кәдімгі жазу бірден жабылады. Шұғыл немесе даулы жағдай қызметкерге беріледі — әңгіме мәтінімен бірге.",
      },
    ],
  },
  voice: {
    mark: "Дауыс",
    titleTop: "Үш тіл.",
    titleAccent: "Бір әңгіме.",
    dialogue: [
      { who: "Науқас", text: "Сәлеметсіз бе, осы аптада терапевтке жазылуым керек.", lang: "RU" },
      { who: "AI Dos", text: "Әрине. Сейсенбі 11:20 және сәрсенбі 14:40 бар — қайсысы ыңғайлы?", lang: "RU" },
      { who: "Науқас", text: "Сейсенбі болады. Ертең қоңырау шалуға бола ма?", lang: "KZ" },
      { who: "AI Dos", text: "Сейсенбі 11:20-ға жаздым. Ертең еске салып, хабарласамын.", lang: "KZ" },
    ],
    note: "Науқас үшінші репликада қазақшаға көшті. Ассистент онымен бірге көшіп, жиналған контекстті сақтап қалды.",
    features: [
      {
        title: "Тіл өзі анықталады",
        body: "Ассистент «орысша үшін 1-ді басыңыз» деп сұрамайды. Ол тілді естиді және сол тілде жауап береді.",
      },
      {
        title: "Науқас сөзін бөле алады",
        body: "Егер адам жауаптың үстінен сөйлей бастаса, ассистент үндемей қалады — тірі оператор сияқты.",
      },
      {
        title: "Кідіріс өлшенеді",
        body: "Бірінші дыбысқа дейінгі уақыт әр сессияда тіркеледі. Баяу әңгіме есептерде көрінеді, құлақпен емес.",
      },
    ],
  },
  night: {
    mark: "Түн",
    title: "Клиника ұйықтап жатқанда",
    lead: "Тіркеу жұмысының бір бөлігі әңгімені қажет етпейді — бірақ біреудің оны есте сақтауын талап етеді. Мұнымен фондық процестер айналысады.",
    items: [
      {
        time: "21:15",
        title: "Уақыт босады",
        body: "Науқас келуден бас тартты. Жүйе күту тізімінен қолайлы адамды тауып, жарамдылық мерзімі бар ұсыныс жібереді.",
      },
      {
        time: "03:00",
        title: "Еске салу жиналды",
        body: "Ертеңгі қабылдаулар еске салу алады — ол түн ортасында емес, қабылдауға бір күн қалғанда жіберіледі.",
      },
      {
        time: "08:20",
        title: "Өткізілген қабылдау жабылды",
        body: "Науқас келмеді — қабылдау белгіленді, ал қызметкерге хабарласып, жаңа уақыт ұсыну тапсырмасы дайын.",
      },
    ],
  },
  limits: {
    mark: "Шектер",
    titleTop: "AI Dos нені",
    titleAccent: "істемейді",
    lead: "Медицинада бас тарту мүмкіндіктен маңыздырақ. Бұл шектеулер модельдің қалауына емес, өнімге енгізілген.",
    items: [
      {
        title: "Диагноз қоймайды",
        body: "Симптомдарды түсіндірмейді, ем тағайындамайды және талдауларға пікір айтпайды. Қауіпті белгілерде бірден жедел жәрдемге бағыттап, адамды шақырады.",
      },
      {
        title: "Интеграцияны ойлап таппайды",
        body: "Клиника DAMUMED-тің ресми API-ін алмайынша, адаптер дерек алмасуды имитациялаудың орнына «қолжетімдікті күтуде» деп адал көрсетеді.",
      },
      {
        title: "«Жіберілді» деп алдын ала айтпайды",
        body: "Хабарлама провайдердің жауабынан кейін ғана жеткізілді деп саналады. Тіркелгі деректерсіз ол түсінікті мәртебемен кезекте тұрады.",
      },
      {
        title: "Келісімсіз қоңырау шалмайды",
        body: "Бос уақыт ұсынысы тек келісімін тіркегендерге жіберіледі. Қалғандары тіркеу үшін тапсырма болып қалады.",
      },
    ],
  },
  ground: {
    mark: "Негіз",
    title: "Науқасқа көрінбейтін нәрсе",
    items: [
      {
        title: "Клиникаларды оқшаулау",
        body: "Әр жұмыс кеңістігінің деректері сұраныстар мен дерекқор саясаттары деңгейінде бөлінген.",
      },
      {
        title: "Рөлдер мен құқықтар",
        body: "Әкімші, оператор және дәрігер әртүрлі бөлімдер мен әртүрлі әрекеттерді көреді.",
      },
      {
        title: "Әрекеттер журналы",
        body: "Жазуды кім, қашан және неге өзгерткені — медициналық деректерді қайталамай тіркеледі.",
      },
      {
        title: "Кілттер серверде",
        body: "Провайдерлердің құпиялары браузерге түспейді, сессиялар HttpOnly-cookie-де тұрады.",
      },
    ],
    apiEyebrow: "Ресми API күтуде",
    apiTitle: "DAMUMED интеграциясы дайын, бірақ жұмыс істеп тұрғандай көрінбейді",
    apiBody: "Адаптер келісімшарты, жазуды тасымалдау және сақтаудан кейінгі тексеру жазылып қойған. Клиника құжаттама мен қолжетімдік алысымен, endpoints-ты қосу ғана қалады — ойдан шығарылған өрістер мен растауға келмейтін уәделерсіз.",
  },
  final: {
    titleTop: "Командаға уақытты",
    titleAccent: "науқастарға қайтарыңыз",
    lead: "Жұмыс кеңістігі бір минутта құрылады. Телефония, WhatsApp және МАЖ клиникада қолжетімдік пайда болғанда бөлек қосылады.",
  },
  footer: {
    disclaimer: "Қазақстан клиникаларына арналған AI-тіркеу. Медициналық бұйым емес және диагноз қоймайды.",
    login: "Кіру",
    register: "Тіркелу",
  },
};

const en: Dictionary = {
  nav: { evening: "Evening", call: "The call", voice: "Voice", limits: "Limits" },
  cta: { login: "Log in", create: "Create clinic", how: "How it works" },
  hero: {
    eyebrow: "AI front desk · Kazakhstan",
    titleTop: "The clinic closes at seven.",
    titleAccent: "Patients don't.",
    lead: "AI Dos answers calls and messages after the front desk has gone home: it clarifies the request, finds an open slot and confirms the booking — in Kazakh, Russian and English.",
    scrollHint: "Scroll — the story is below",
    railStart: "Beginning",
  },
  promises: [
    {
      title: "Around the clock",
      body: "A call at 23:40 is handled just like one at 11:00 — no voicemail, no queue.",
    },
    {
      title: "Three languages",
      body: "A patient switches to Kazakh mid-sentence — the conversation never breaks.",
    },
    {
      title: "A human in the loop",
      body: "Anything beyond a booking goes to a staff member together with the context.",
    },
  ],
  evening: {
    mark: "Evening",
    title: "One evening at the front desk",
    lead: "Nothing dramatic happens. The phone simply rings after closing — and everything after that depends on who picks up.",
    nowLabel: "How it is now",
    usLabel: "With AI Dos",
    without: [
      { time: "18:40", text: "A patient dials the clinic." },
      { time: "18:41", text: "Twelve rings. Voicemail asks them to call back in the morning." },
      { time: "18:44", text: "A second call, just in case. Same result." },
      { time: "18:47", text: "They open the map and call the clinic across the street." },
      { time: "09:00", text: "The front desk arrives for its shift. No one learns of the call.", muted: true },
    ],
    withUs: [
      { time: "18:40", text: "A patient dials the clinic." },
      { time: "18:40", text: "AI Dos answers, hears Kazakh — and switches to it." },
      { time: "18:41", text: "Finds three open slots with the right specialist." },
      { time: "18:42", text: "The booking is confirmed. The patient gets a time and address." },
      { time: "09:00", text: "The front desk arrives and sees a finished booking." },
    ],
    quote: "A missed call isn't a missed call. It's a patient who booked with the clinic next door.",
  },
  call: {
    mark: "The call",
    title: "The forty seconds a booking is made of",
    lead: "The conversation looks simple because the hard part is hidden inside: checking the schedule, preventing double-booking, and deciding when to bring in a human.",
    steps: [
      {
        title: "Hears the request",
        body: "The patient speaks in their own words: “sore throat for two days, I need an ENT.” No buttons, no menus.",
      },
      {
        title: "Asks only what's needed",
        body: "Name, phone, a convenient time. National ID and medical details aren't requested — they aren't needed to book.",
      },
      {
        title: "Reads the live schedule",
        body: "Open slots come from the doctor's schedule, accounting for time off and already-taken slots.",
      },
      {
        title: "Holds the slot",
        body: "Two patients can't get the same time: overlapping bookings are forbidden at the database level, not by a check in code.",
      },
      {
        title: "Confirms or hands off",
        body: "A routine booking closes at once. An urgent or unclear case goes to a staff member — with a transcript of the conversation.",
      },
    ],
  },
  voice: {
    mark: "Voice",
    titleTop: "Three languages.",
    titleAccent: "One conversation.",
    dialogue: [
      { who: "Patient", text: "Hello, I need to see a therapist this week.", lang: "RU" },
      { who: "AI Dos", text: "Of course. There's Tuesday 11:20 and Wednesday 14:40 — which suits you?", lang: "RU" },
      { who: "Patient", text: "Сейсенбі болады. Ертең қоңырау шалуға бола ма?", lang: "KZ" },
      { who: "AI Dos", text: "Сейсенбі 11:20-ға жаздым. Ертең еске салып, хабарласамын.", lang: "KZ" },
    ],
    note: "The patient switched to Kazakh on the third line. The assistant switched with them and kept the context already gathered.",
    features: [
      {
        title: "The language detects itself",
        body: "The assistant doesn't ask “press 1 for Russian.” It hears the language and answers in it.",
      },
      {
        title: "The patient can interrupt",
        body: "If someone starts speaking over the reply, the assistant falls silent — the way a live operator does.",
      },
      {
        title: "Latency is measured",
        body: "Time to first sound is recorded in every session. A slow conversation shows up in reports, not just to the ear.",
      },
    ],
  },
  night: {
    mark: "Night",
    title: "While the clinic sleeps",
    lead: "Part of front-desk work needs no conversation — but it does need someone to remember it. Background jobs take that on.",
    items: [
      {
        time: "21:15",
        title: "A slot opened up",
        body: "A patient cancelled. The system finds a suitable person from the waitlist and sends an offer with an expiry.",
      },
      {
        time: "03:00",
        title: "Reminders assembled",
        body: "Tomorrow's visits get a reminder — sent a day before the appointment, not in the middle of the night.",
      },
      {
        time: "08:20",
        title: "A no-show closed",
        body: "The patient didn't come — the visit is marked, and a task is ready for staff to reach out and offer a new time.",
      },
    ],
  },
  limits: {
    mark: "Limits",
    titleTop: "What AI Dos",
    titleAccent: "does not do",
    lead: "In medicine, refusing matters more than being able. These limits are built into the product, not left to the model's discretion.",
    items: [
      {
        title: "Doesn't diagnose",
        body: "It doesn't interpret symptoms, prescribe treatment or comment on test results. At alarming signs it directs to emergency care and calls a human at once.",
      },
      {
        title: "Doesn't fake integration",
        body: "Until the clinic has the official DAMUMED API, the adapter honestly shows “awaiting access” instead of imitating a data exchange.",
      },
      {
        title: "Doesn't say “sent” early",
        body: "A notification counts as delivered only after the provider responds. Without credentials it waits in the queue with a clear status.",
      },
      {
        title: "Doesn't call without consent",
        body: "An open-slot offer goes out only to those who recorded consent. The rest remain a task for the front desk.",
      },
    ],
  },
  ground: {
    mark: "Foundation",
    title: "What the patient never sees",
    items: [
      {
        title: "Clinic isolation",
        body: "Each workspace's data is separated at the level of queries and database policies.",
      },
      {
        title: "Roles and permissions",
        body: "Admin, operator and doctor see different sections and different actions.",
      },
      {
        title: "Action log",
        body: "Who changed a record, when and why — recorded without duplicating medical data.",
      },
      {
        title: "Keys on the server",
        body: "Provider secrets never reach the browser; sessions live in HttpOnly cookies.",
      },
    ],
    apiEyebrow: "Awaiting the official API",
    apiTitle: "The DAMUMED integration is ready, but doesn't pretend to work",
    apiBody: "The adapter contract, the booking transfer and the post-save verification are already written. Once the clinic has documentation and access, only the endpoints remain to connect — with no invented fields and no promises that can't be backed up.",
  },
  final: {
    titleTop: "Give the team back its time",
    titleAccent: "for patients",
    lead: "A workspace is created in a minute. Telephony, WhatsApp and the medical system connect separately, once the clinic has access.",
  },
  footer: {
    disclaimer: "An AI front desk for clinics in Kazakhstan. Not a medical device and does not diagnose.",
    login: "Log in",
    register: "Register",
  },
};

export const dictionaries: Record<Locale, Dictionary> = { ru, kk, en };

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}
