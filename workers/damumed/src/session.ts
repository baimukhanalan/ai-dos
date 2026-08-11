import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { config } from "./config.js";
import { log } from "./log.js";
import { LABELS } from "./ui.js";

/** Сессия истекла — это не ошибка клиники, а повод позвать человека. */
export class SessionExpiredError extends Error {
  constructor(message = "Сессия DamuMed истекла: выполните npm run login") {
    super(message);
    this.name = "SessionExpiredError";
  }
}

export type Session = {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  close(): Promise<void>;
};

export async function openSession(options: { headless?: boolean } = {}): Promise<Session> {
  const useStorage = existsSync(config.storageStatePath);
  if (!useStorage && options.headless !== false) {
    throw new SessionExpiredError(
      `Файл сессии ${config.storageStatePath} не найден: выполните npm run login`,
    );
  }

  const browser = await chromium.launch({
    headless: options.headless ?? config.headless,
  });
  const context = await browser.newContext({
    storageState: useStorage ? config.storageStatePath : undefined,
    locale: "ru-RU",
    timezoneId: config.timeZone,
    viewport: { width: 1600, height: 900 },
  });
  context.setDefaultTimeout(config.stepTimeoutMs);
  context.setDefaultNavigationTimeout(config.navigationTimeoutMs);

  const page = await context.newPage();
  return {
    browser,
    context,
    page,
    close: async () => {
      await context.close().catch(() => undefined);
      await browser.close().catch(() => undefined);
    },
  };
}

/**
 * Признак живой сессии — рабочий стол регистратуры с кнопкой выхода. Если
 * вместо него открылась форма входа, дальше идти нельзя: любое действие
 * потерялось бы, а запись осталась бы незаведённой.
 */
export async function ensureDesktop(page: Page) {
  const target = `${config.baseUrl}${config.desktopPath}`;
  if (!page.url().startsWith(target)) {
    await page.goto(target, { waitUntil: "domcontentloaded" });
  }

  const desktop = page.getByText(LABELS.menuBooking, { exact: false }).first();
  const loggedIn = await desktop
    .waitFor({ state: "visible", timeout: config.stepTimeoutMs })
    .then(() => true)
    .catch(() => false);

  if (!loggedIn) {
    throw new SessionExpiredError();
  }
}

export async function saveArtifacts(page: Page, name: string) {
  await mkdir(config.artifactsDir, { recursive: true });
  const stamp = name.replace(/[^a-z0-9_-]+/gi, "_");
  const shot = `${config.artifactsDir}/${stamp}.png`;
  await page.screenshot({ path: shot, fullPage: true }).catch(() => undefined);
  log.info("сохранён снимок экрана", { path: shot });
  return shot;
}

export function pause(ms = config.actionDelayMs) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
