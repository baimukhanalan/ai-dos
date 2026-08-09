import type { PatientIntent } from "@/lib/ai/escalation";

/**
 * Intent, при которых нельзя действовать/выдавать данные без подтверждённой
 * личности пациента. Знать имя — недостаточно: по имени чувствительное не
 * раскрываем.
 */
const identityRequiredIntents: ReadonlySet<PatientIntent> = new Set([
  "reschedule",
  "cancel",
  "appointment_info",
  "results",
]);

export function requiresIdentity(intent: PatientIntent) {
  return identityRequiredIntents.has(intent);
}

export type IdentityInput = {
  fullName?: string | null;
  phone?: string | null;
  birthDate?: string | null;
};

export type IdentityDecision = {
  /** Достаточно ли данных, чтобы вообще пытаться сверить личность. */
  canAttempt: boolean;
  missing: Array<"phone" | "fullName" | "birthDate">;
};

/**
 * Подтверждение требует телефон плюс ещё один фактор (ФИО или дата рождения).
 * Одного имени мало — иначе данные утекут любому, кто знает пациента.
 */
export function identityDecision(input: IdentityInput): IdentityDecision {
  const missing: IdentityDecision["missing"] = [];
  const hasPhone = Boolean(input.phone && input.phone.replace(/\D/g, "").length >= 10);
  const hasName = Boolean(input.fullName && input.fullName.trim().length >= 3);
  const hasDob = Boolean(input.birthDate && /^\d{4}-\d{2}-\d{2}$/.test(input.birthDate));

  if (!hasPhone) missing.push("phone");
  if (!hasName && !hasDob) {
    missing.push("fullName");
    missing.push("birthDate");
  }
  return { canAttempt: hasPhone && (hasName || hasDob), missing };
}

const prompts: Record<"ru" | "kk" | "en", string> = {
  ru: "Чтобы продолжить с вашей записью, подтвердите личность: назовите номер телефона и фамилию (или дату рождения). Данные пациента я не раскрываю без подтверждения.",
  kk: "Жазбаңызбен жалғастыру үшін жеке басыңызды растаңыз: телефон нөмірі мен тегіңізді (немесе туған күніңізді) айтыңыз. Растаусыз пациент деректерін ашпаймын.",
  en: "To continue with your appointment, please confirm your identity: your phone number and surname (or date of birth). I don't disclose patient data without confirmation.",
};

export function identityPrompt(language: "ru" | "kk" | "en") {
  return prompts[language];
}
