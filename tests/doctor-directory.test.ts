import { describe, expect, it } from "vitest";
import {
  buildDoctorDirectoryAnswer,
  formatDoctorDirectoryFact,
} from "@/lib/ai/doctor-directory";
import { formatClinicAiContext } from "@/lib/ai/clinic-context";

describe("doctor directory grounding", () => {
  const doctor = {
    id: "doctor-1",
    display_name: "Дуйсенбаева Жанна Кыргызбековна",
    specialty: "Общая практика",
    room: "29",
    weekly_schedule: [
      { weekday: 1, startsAt: "08:00", endsAt: "13:00", slotMinutes: 30 },
      { weekday: 2, startsAt: "11:00", endsAt: "17:00", slotMinutes: 30 },
    ],
  };

  it("formats exact names, days and hours without vague dayparts", () => {
    expect(formatDoctorDirectoryFact(doctor)).toBe(
      "Дуйсенбаева Жанна Кыргызбековна — Общая практика, каб. 29: Пн 08:00–13:00; Вт 11:00–17:00",
    );
  });

  it("produces a server-side answer guide and forbids invented doctors", () => {
    const answer = buildDoctorDirectoryAnswer([doctor]);
    expect(answer).toContain("Дуйсенбаева Жанна Кыргызбековна");
    expect(answer).toContain("Пн 08:00–13:00");
    expect(answer).toContain("find_available_slots");
  });

  it("does not invent a fallback doctor when the active directory is empty", () => {
    expect(buildDoctorDirectoryAnswer([])).toContain("Не называй вымышленные имена");
  });

  it("keeps authoritative doctors before long knowledge articles", () => {
    const context = formatClinicAiContext({
      doctors: [
        {
          id: doctor.id,
          name: doctor.display_name,
          specialty: doctor.specialty,
          branch: null,
          languages: ["ru"],
          weeklySchedule: doctor.weekly_schedule,
        },
      ],
      services: [],
      branches: [],
      scenarios: [],
      rules: [],
      knowledge: [
        {
          id: "long-article",
          title: "Большая статья",
          locale: "ru",
          content: "x".repeat(60_000),
        },
      ],
    });

    expect(context.length).toBeLessThanOrEqual(48_000);
    expect(context).toContain("Дуйсенбаева Жанна Кыргызбековна");
    expect(context).toContain("Пн 08:00–13:00");
    expect(context.indexOf("activeDoctors")).toBeLessThan(
      context.indexOf("approvedKnowledge"),
    );
  });
});
