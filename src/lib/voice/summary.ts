export type VoiceTranscriptItem = {
  role: "patient" | "assistant" | "system";
  text: string;
  at: string;
};

const PHONE_LIKE = /(?:\+?\d[\s().-]*){10,15}/g;
const IIN_LIKE = /\b\d{12}\b/g;

function safeExcerpt(value: string, max = 360) {
  return value
    .replace(IIN_LIKE, (match) => `••••••••${match.slice(-4)}`)
    .replace(PHONE_LIKE, (match) => {
      const digits = match.replace(/\D/g, "");
      return digits.length >= 10 ? `+•••••••${digits.slice(-4)}` : match;
    })
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function summarizeVoiceTranscript(transcript: VoiceTranscriptItem[]) {
  const patientMessages = transcript
    .filter((item) => item.role === "patient" && item.text.trim())
    .map((item) => safeExcerpt(item.text));
  const assistantMessages = transcript
    .filter((item) => item.role === "assistant" && item.text.trim())
    .map((item) => safeExcerpt(item.text));

  if (!patientMessages.length) {
    return {
      summary: "Пациент не успел сформулировать запрос.",
      nextAction: "При необходимости повторить голосовой тест или связаться с пациентом.",
    };
  }

  const patientIntent = patientMessages.slice(0, 3).join(" · ").slice(0, 700);
  const lastAnswer = assistantMessages.at(-1);
  const summary = lastAnswer
    ? `Запрос пациента: ${patientIntent}. Последний ответ AI Dos: ${lastAnswer}`
    : `Запрос пациента: ${patientIntent}. Ответ AI Dos не был завершён.`;
  const normalized = `${patientMessages.join(" ")} ${assistantMessages.join(" ")}`
    .toLocaleLowerCase("ru-KZ");

  let nextAction = "Просмотреть результат и при необходимости продолжить разговор с пациентом.";
  if (/103|112|сроч|неотлож|жедел|emergency/.test(normalized)) {
    nextAction = "Срочно проверить обращение и убедиться, что пациенту предложена экстренная помощь.";
  } else if (/перезвон|обратн.{0,8}звон|callback/.test(normalized)) {
    nextAction = "Проверить заявку на обратный звонок и назначить ответственного сотрудника.";
  } else if (/запис|при[её]м|слот|врач|doctor|appointment/.test(normalized)) {
    nextAction = "Проверить, завершена ли запись; если нет — продолжить подбор врача и времени.";
  }

  return { summary: summary.slice(0, 1_200), nextAction };
}
