import "server-only";

import { AppError } from "@/lib/errors";
import {
  findAvailableSlots,
  listPublicDoctors,
  listPublicServices,
} from "@/lib/dal/operations";

export type AdapterContext = { tenantId: string };

/** То, что нужно внешней МИС, чтобы завести приём. Без диагнозов и ИИН. */
export type MisAppointmentInput = {
  appointmentId: string;
  patientFullName: string;
  patientPhone: string | null;
  patientBirthDate: string | null;
  doctorName: string;
  doctorExternalId: string | null;
  serviceName: string | null;
  startsAt: string;
  endsAt: string;
};

export type MisSyncResult =
  /** Запись заведена и перечитана обратно — врач её видит. */
  | { status: "synced"; externalId: string; verified: boolean }
  /** Внешней МИС нет, источник правды только AI Dos. */
  | { status: "not_required" }
  /**
   * Адаптер ещё не настроен. Это не ошибка клиники: запись остаётся в
   * очереди, попытка не засчитывается и сотрудника не дёргают.
   */
  | { status: "unavailable"; message: string }
  | { status: "failed"; errorCode: string; message: string; retryable: boolean };

export interface MedicalInformationSystemAdapter {
  readonly provider: "sandbox" | "damumed";
  listServices(context: AdapterContext): Promise<unknown>;
  listDoctors(context: AdapterContext, specialty?: string): Promise<unknown>;
  findSlots(
    context: AdapterContext,
    doctorId: string,
    days?: number,
  ): Promise<unknown>;
  /** Переносит подтверждённую запись во внешнюю систему. */
  syncAppointment(
    context: AdapterContext,
    input: MisAppointmentInput,
  ): Promise<MisSyncResult>;
  /**
   * Перечитывает запись по внешнему идентификатору. Без этого шага нельзя
   * отличить «форма отправилась» от «запись действительно сохранилась».
   */
  verifyAppointment(
    context: AdapterContext,
    externalId: string,
  ): Promise<boolean>;
}

export class SandboxMedicalInformationSystemAdapter implements MedicalInformationSystemAdapter {
  readonly provider = "sandbox" as const;

  listServices({ tenantId }: AdapterContext) {
    return listPublicServices(tenantId);
  }

  listDoctors({ tenantId }: AdapterContext, specialty?: string) {
    return listPublicDoctors(tenantId, specialty);
  }

  findSlots({ tenantId }: AdapterContext, doctorId: string, days = 7) {
    return findAvailableSlots(tenantId, doctorId, days);
  }

  async syncAppointment(): Promise<MisSyncResult> {
    return { status: "not_required" };
  }

  async verifyAppointment() {
    return true;
  }
}

export class DamuMedAdapter implements MedicalInformationSystemAdapter {
  readonly provider = "damumed" as const;

  private unavailable(): never {
    throw new AppError(
      "integration_unavailable",
      503,
      "DAMUMED ожидает официальный API и учётные данные клиники.",
    );
  }

  async listServices(context: AdapterContext) {
    void context;
    return this.unavailable();
  }

  async listDoctors(context: AdapterContext, specialty?: string) {
    void context;
    void specialty;
    return this.unavailable();
  }

  async findSlots(context: AdapterContext, doctorId: string, days?: number) {
    void context;
    void doctorId;
    void days;
    return this.unavailable();
  }

  async syncAppointment(): Promise<MisSyncResult> {
    return {
      status: "unavailable",
      message: "DAMUMED ожидает официальный API и учётные данные клиники.",
    };
  }

  async verifyAppointment() {
    return false;
  }
}

export function getMedicalAdapter(
  mode = process.env.MIS_ADAPTER,
): MedicalInformationSystemAdapter {
  return mode === "damumed"
    ? new DamuMedAdapter()
    : new SandboxMedicalInformationSystemAdapter();
}
