export const supportedLanguages = ["ru", "kk", "en"] as const;
export type SupportedLanguage = (typeof supportedLanguages)[number];

/**
 * Язык сообщения по написанию: специфические казахские буквы — надёжный
 * признак, латиница без кириллицы — английский, остальное — русский.
 */
export function detectLanguage(text: string): SupportedLanguage {
  if (/[әғқңөұүһі]/i.test(text)) return "kk";
  if (/^[\x00-\x7F\s\p{P}\p{N}]+$/u.test(text)) return "en";
  return "ru";
}

/**
 * Язык диалога, а не отдельной реплики. Короткие ответы («да», «ок») не должны
 * переключать язык беседы, поэтому смена принимается только на явном казахском
 * признаке или на достаточно длинной фразе.
 */
export function conversationLanguage(
  text: string,
  current: SupportedLanguage,
): SupportedLanguage {
  const detected = detectLanguage(text);
  if (detected === "kk") return "kk";
  if (text.trim().length >= 12) return detected;
  return current;
}
