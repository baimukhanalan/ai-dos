export const notificationLocales = ["ru", "kk", "en"] as const;
export type NotificationLocale = (typeof notificationLocales)[number];

/**
 * Каналы описаны здесь, а не в `providers`, чтобы схемы валидации и клиентские
 * формы могли их импортировать без серверных зависимостей.
 */
export const notificationChannels = [
  "portal",
  "sms",
  "whatsapp",
  "telegram",
  "email",
] as const;
export type NotificationChannel = (typeof notificationChannels)[number];

export const notificationChannelLabels: Record<NotificationChannel, string> = {
  portal: "Портал",
  sms: "SMS",
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  email: "Email",
};

export const notificationTemplateCodes = [
  "appointment_confirmed",
  "appointment_rescheduled",
  "appointment_cancelled",
  "appointment_reminder",
  "waitlist_offer",
  "no_show_followup",
  "callback_received",
] as const;
export type NotificationTemplateCode = (typeof notificationTemplateCodes)[number];

export type TemplateBody = { subject?: string; body: string };

/**
 * Встроенные тексты используются, пока клиника не опубликовала собственный
 * шаблон в `notification_templates`. Они намеренно нейтральны: без диагнозов,
 * без медицинских деталей и без персональных идентификаторов кроме имени.
 */
export const defaultTemplates: Record<
  NotificationTemplateCode,
  Record<NotificationLocale, TemplateBody>
> = {
  appointment_confirmed: {
    ru: {
      subject: "{{clinic}}: запись подтверждена",
      body: "{{patientName}}, вы записаны к специалисту {{doctorName}} на {{startsAt}}. Клиника: {{clinic}}. Отменить или перенести: {{supportPhone}}.",
    },
    kk: {
      subject: "{{clinic}}: жазылу расталды",
      body: "{{patientName}}, сіз {{doctorName}} дәрігеріне {{startsAt}} уақытына жазылдыңыз. Клиника: {{clinic}}. Болдырмау немесе ауыстыру: {{supportPhone}}.",
    },
    en: {
      subject: "{{clinic}}: appointment confirmed",
      body: "{{patientName}}, your appointment with {{doctorName}} is confirmed for {{startsAt}}. Clinic: {{clinic}}. To cancel or reschedule call {{supportPhone}}.",
    },
  },
  appointment_rescheduled: {
    ru: {
      subject: "{{clinic}}: запись перенесена",
      body: "{{patientName}}, ваша запись к специалисту {{doctorName}} перенесена на {{startsAt}}. Если время не подходит, позвоните: {{supportPhone}}.",
    },
    kk: {
      subject: "{{clinic}}: жазылу ауыстырылды",
      body: "{{patientName}}, {{doctorName}} дәрігеріне жазылуыңыз {{startsAt}} уақытына ауыстырылды. Уақыт ыңғайсыз болса, хабарласыңыз: {{supportPhone}}.",
    },
    en: {
      subject: "{{clinic}}: appointment moved",
      body: "{{patientName}}, your appointment with {{doctorName}} was moved to {{startsAt}}. If the new time does not work, call {{supportPhone}}.",
    },
  },
  appointment_cancelled: {
    ru: {
      subject: "{{clinic}}: запись отменена",
      body: "{{patientName}}, запись к специалисту {{doctorName}} на {{startsAt}} отменена. Чтобы выбрать другое время, позвоните: {{supportPhone}}.",
    },
    kk: {
      subject: "{{clinic}}: жазылу болдырылмады",
      body: "{{patientName}}, {{doctorName}} дәрігеріне {{startsAt}} уақытына жазылу болдырылмады. Басқа уақыт таңдау үшін хабарласыңыз: {{supportPhone}}.",
    },
    en: {
      subject: "{{clinic}}: appointment cancelled",
      body: "{{patientName}}, your appointment with {{doctorName}} on {{startsAt}} was cancelled. Call {{supportPhone}} to pick another time.",
    },
  },
  appointment_reminder: {
    ru: {
      subject: "{{clinic}}: напоминание о визите",
      body: "{{patientName}}, напоминаем о визите к специалисту {{doctorName}} {{startsAt}}. Если планы изменились, сообщите заранее: {{supportPhone}}.",
    },
    kk: {
      subject: "{{clinic}}: қабылдау туралы еске салу",
      body: "{{patientName}}, {{doctorName}} дәрігеріне қабылдау {{startsAt}} уақытында. Жоспар өзгерсе, алдын ала хабарлаңыз: {{supportPhone}}.",
    },
    en: {
      subject: "{{clinic}}: visit reminder",
      body: "{{patientName}}, a reminder about your visit to {{doctorName}} on {{startsAt}}. If your plans changed, let us know: {{supportPhone}}.",
    },
  },
  waitlist_offer: {
    ru: {
      subject: "{{clinic}}: освободилось время",
      body: "{{patientName}}, освободилось время у специалиста {{doctorName}}: {{startsAt}}. Предложение действует до {{expiresAt}}. Подтвердите по телефону {{supportPhone}}.",
    },
    kk: {
      subject: "{{clinic}}: уақыт босады",
      body: "{{patientName}}, {{doctorName}} дәрігерінде уақыт босады: {{startsAt}}. Ұсыныс {{expiresAt}} дейін жарамды. {{supportPhone}} нөмірі арқылы растаңыз.",
    },
    en: {
      subject: "{{clinic}}: a slot opened up",
      body: "{{patientName}}, a slot with {{doctorName}} opened up: {{startsAt}}. The offer is valid until {{expiresAt}}. Confirm at {{supportPhone}}.",
    },
  },
  no_show_followup: {
    ru: {
      subject: "{{clinic}}: вы пропустили визит",
      body: "{{patientName}}, вы не пришли на приём {{startsAt}}. Мы сохранили ваше место в очереди — позвоните {{supportPhone}}, чтобы выбрать новое время.",
    },
    kk: {
      subject: "{{clinic}}: қабылдауға келмедіңіз",
      body: "{{patientName}}, {{startsAt}} қабылдауға келмедіңіз. Жаңа уақыт таңдау үшін {{supportPhone}} нөміріне қоңырау шалыңыз.",
    },
    en: {
      subject: "{{clinic}}: missed visit",
      body: "{{patientName}}, you missed the visit on {{startsAt}}. Call {{supportPhone}} to pick a new time.",
    },
  },
  callback_received: {
    ru: {
      subject: "{{clinic}}: заявка принята",
      body: "{{patientName}}, заявка на обратный звонок принята. Регистратура {{clinic}} свяжется с вами в рабочее время.",
    },
    kk: {
      subject: "{{clinic}}: өтінім қабылданды",
      body: "{{patientName}}, кері қоңырауға өтінім қабылданды. {{clinic}} тіркеу бөлімі жұмыс уақытында хабарласады.",
    },
    en: {
      subject: "{{clinic}}: request received",
      body: "{{patientName}}, your callback request was received. The {{clinic}} front desk will contact you during working hours.",
    },
  },
};

const placeholder = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

export function isTemplateCode(value: string): value is NotificationTemplateCode {
  return (notificationTemplateCodes as readonly string[]).includes(value);
}

export function resolveLocale(value: string | null | undefined): NotificationLocale {
  const normalized = String(value || "")
    .trim()
    .slice(0, 2)
    .toLowerCase();
  return (notificationLocales as readonly string[]).includes(normalized)
    ? (normalized as NotificationLocale)
    : "ru";
}

function placeholdersOf(segment: string) {
  return Array.from(segment.matchAll(placeholder), (match) => match[1]);
}

/**
 * Подставляет переменные и сообщает о незаполненных плейсхолдерах, чтобы
 * пациенту не ушёл текст с «{{doctorName}}» внутри. С
 * `omitIncompleteSentences` предложение с неизвестной переменной убирается
 * целиком — например, строка про телефон регистратуры, если номер не задан.
 */
export function renderTemplate(
  body: string,
  variables: Record<string, string | null | undefined>,
  options: { omitIncompleteSentences?: boolean } = {},
) {
  const missing = new Set<string>();
  const segments = body.split(/(?<=[.!?])\s+/);
  const kept: string[] = [];
  let omitted = 0;

  for (const segment of segments) {
    const unresolved = placeholdersOf(segment).filter((key) => {
      const value = variables[key];
      return value === undefined || value === null || value === "";
    });
    unresolved.forEach((key) => missing.add(key));
    if (unresolved.length && options.omitIncompleteSentences) {
      omitted += 1;
      continue;
    }
    kept.push(
      segment.replace(placeholder, (_match, key: string) =>
        String(variables[key] ?? ""),
      ),
    );
  }

  return {
    text: kept.join(" ").replace(/[ \t]{2,}/g, " ").trim(),
    missing: [...missing],
    omitted,
  };
}

const localeTags: Record<NotificationLocale, string> = {
  ru: "ru-KZ",
  kk: "kk-KZ",
  en: "en-GB",
};

export function formatMoment(
  value: Date | string,
  timezone: string,
  locale: NotificationLocale,
) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(localeTags[locale], {
    timeZone: timezone || "Asia/Almaty",
    dateStyle: "long",
    timeStyle: "short",
  }).format(date);
}

export function getDefaultTemplate(
  code: string,
  locale: NotificationLocale,
): TemplateBody | null {
  if (!isTemplateCode(code)) return null;
  return defaultTemplates[code][locale] ?? defaultTemplates[code].ru;
}
