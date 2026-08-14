export type DoctorScheduleRule = {
  weekday: number;
  startsAt: string;
  endsAt: string;
  slotMinutes?: number;
};

export type DoctorDirectoryEntry = {
  id: string;
  display_name: string;
  specialty: string | null;
  branch?: string | null;
  room?: string | null;
  weekly_schedule: DoctorScheduleRule[];
  upcoming_exceptions?: Array<{
    date: string;
    startsAt: string | null;
    endsAt: string | null;
    available: boolean;
    reason: string | null;
  }>;
  external_available_slots?: Array<{
    startsAt: string;
    endsAt: string;
    observedAt: string;
  }>;
};

const weekdays = ["", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function cleanTime(value: string) {
  return value.slice(0, 5);
}

export function formatDoctorDirectoryFact(entry: DoctorDirectoryEntry) {
  const schedule = entry.weekly_schedule
    .filter((rule) => rule.weekday >= 1 && rule.weekday <= 7)
    .map(
      (rule) =>
        `${weekdays[rule.weekday]} ${cleanTime(rule.startsAt)}–${cleanTime(rule.endsAt)}`,
    )
    .join("; ");
  const specialty = entry.specialty || "специальность не указана";
  const room = entry.room ? `, каб. ${entry.room}` : "";
  const externalSlots = (entry.external_available_slots || [])
    .slice(0, 4)
    .map((slot) => new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Almaty" }).format(new Date(slot.startsAt)))
    .join(", ");
  return `${entry.display_name} — ${specialty}${room}: ${schedule || "график не опубликован"}${externalSlots ? `; DAMUMED свободно: ${externalSlots}` : ""}`;
}

export function buildDoctorDirectoryAnswer(entries: DoctorDirectoryEntry[]) {
  if (!entries.length) {
    return "В активном справочнике клиники нет врачей. Не называй вымышленные имена и предложи связаться с администратором.";
  }
  return [
    "Назови пациенту только этих активных врачей и этот точный еженедельный график:",
    ...entries.map((entry) => `- ${formatDoctorDirectoryFact(entry)}`),
    "График работы не равен наличию свободного слота. Для свободного времени используй find_available_slots.",
  ].join("\n");
}
