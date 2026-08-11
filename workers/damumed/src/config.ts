import { resolve } from "node:path";
import "dotenv/config";

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Не задана переменная окружения ${name}`);
  return value;
}

function number(name: string, fallback: number, min: number, max: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= min && value <= max ? Math.round(value) : fallback;
}

export const config = {
  /** Адрес регистратуры клиники: у каждого региона он свой. */
  baseUrl: (process.env.DAMUMED_BASE_URL || "https://reg-ala.dmed.kz").replace(/\/$/, ""),
  desktopPath: process.env.DAMUMED_DESKTOP_PATH || "/Home/Desktop",
  timeZone: process.env.CLINIC_TIMEZONE || "Asia/Almaty",

  /**
   * Сессия сохраняется один раз вручную (`npm run login`) и переиспользуется.
   * Пароль в переменных окружения не хранится: он не нужен воркеру и не
   * должен лежать на диске сервера.
   */
  storageStatePath: resolve(
    process.env.DAMUMED_STORAGE_STATE || "./storage-state.json",
  ),
  artifactsDir: resolve(process.env.DAMUMED_ARTIFACTS_DIR || "./artifacts"),

  headless: process.env.DAMUMED_HEADLESS !== "false",
  /** Пауза между действиями: чужой сервер не должен получать шквал запросов. */
  actionDelayMs: number("DAMUMED_ACTION_DELAY_MS", 400, 0, 5000),
  navigationTimeoutMs: number("DAMUMED_NAVIGATION_TIMEOUT_MS", 30_000, 5_000, 120_000),
  stepTimeoutMs: number("DAMUMED_STEP_TIMEOUT_MS", 15_000, 2_000, 60_000),

  get aiDosUrl() {
    return required("AIDOS_BASE_URL").replace(/\/$/, "");
  },
  get workerSecret() {
    return required("MIS_WORKER_SECRET");
  },
  batchLimit: number("DAMUMED_BATCH_LIMIT", 10, 1, 50),
  pollIntervalMs: number("DAMUMED_POLL_INTERVAL_MS", 60_000, 10_000, 900_000),

  /** Значения по умолчанию для формы записи — совпадают с ручной практикой. */
  form: {
    paymentType: process.env.DAMUMED_PAYMENT_TYPE || "Государственные",
    placeOfService: process.env.DAMUMED_PLACE_OF_SERVICE || "В поликлинике",
    reasonFallback: process.env.DAMUMED_REASON || "Обращение через AI Dos",
  },
};

export type Config = typeof config;
